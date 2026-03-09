import sharp from 'sharp';
import { createHash } from 'crypto';
import { createLogger, format, transports } from 'winston';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'large-image-processor' },
  transports: [new transports.Console()],
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LargeImageOptions {
  maxTileSize: number;
  overlapPixels: number;
  maxMemoryMB: number;
  previewScale: number;
  outputFormat: 'png' | 'jpeg' | 'webp';
}

export interface LargeImageRequest {
  imageBuffer: Buffer;
  options?: Partial<LargeImageOptions>;
}

export interface ProcessedTile {
  id: string;
  row: number;
  column: number;
  bbox: BoundingBox;
  buffer: Buffer;
  hash: string;
}

export interface TiledProcessingResult {
  tiles: ProcessedTile[];
  originalDimensions: { width: number; height: number };
  tileGrid: { columns: number; rows: number };
  processingTimeMs: number;
  peakMemoryMB: number;
}

export interface MultiScaleAnalysis {
  preview: { buffer: Buffer; scale: number; width: number; height: number };
  medium: { buffer: Buffer; scale: number; width: number; height: number } | null;
  full: { width: number; height: number };
}

export interface StreamingReconstructionPipeline {
  addTile(tile: ProcessedTile): Promise<void>;
  finalize(): Promise<Buffer>;
  getProgress(): {
    tilesProcessed: number;
    totalTiles: number;
    memoryUsedMB: number;
  };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
const DEFAULT_OPTIONS: LargeImageOptions = {
  maxTileSize: 2048,
  overlapPixels: 64,
  maxMemoryMB: 512,
  previewScale: 0.25,
  outputFormat: 'png',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export class LargeImageProcessor {
  constructor() {
    logger.info('LargeImageProcessor initialised');
  }

  // -----------------------------------------------------------------------
  // Public: processLargeImage
  // -----------------------------------------------------------------------
  async processLargeImage(
    request: LargeImageRequest,
  ): Promise<TiledProcessingResult> {
    const startTime = Date.now();
    const options: LargeImageOptions = { ...DEFAULT_OPTIONS, ...request.options };

    logger.info('Processing large image', {
      bufferSize: request.imageBuffer.length,
      options,
    });

    const metadata = await sharp(request.imageBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (width === undefined || height === undefined) {
      throw new Error('Unable to read image dimensions from metadata');
    }

    let peakMemoryMB = this.getMemoryUsageMB();

    const needsTiling =
      width > options.maxTileSize || height > options.maxTileSize;

    let tiles: ProcessedTile[];
    let grid: { columns: number; rows: number };

    if (!needsTiling) {
      logger.info('Image fits in a single tile', { width, height });
      const hash = this.computeHash(request.imageBuffer);
      tiles = [
        {
          id: `tile-0-0`,
          row: 0,
          column: 0,
          bbox: { x: 0, y: 0, width, height },
          buffer: request.imageBuffer,
          hash,
        },
      ];
      grid = { columns: 1, rows: 1 };
    } else {
      tiles = await this.splitIntoTiles(request.imageBuffer, options);
      const gridInfo = this.computeTileGrid(
        width,
        height,
        options.maxTileSize,
        options.overlapPixels,
      );
      grid = { columns: gridInfo.columns, rows: gridInfo.rows };
    }

    const currentMemory = this.getMemoryUsageMB();
    if (currentMemory > peakMemoryMB) {
      peakMemoryMB = currentMemory;
    }

    const processingTimeMs = Date.now() - startTime;
    logger.info('Processing complete', { tiles: tiles.length, processingTimeMs });

    return {
      tiles,
      originalDimensions: { width, height },
      tileGrid: grid,
      processingTimeMs,
      peakMemoryMB,
    };
  }

  // -----------------------------------------------------------------------
  // Public: splitIntoTiles
  // -----------------------------------------------------------------------
  async splitIntoTiles(
    imageBuffer: Buffer,
    options: LargeImageOptions,
  ): Promise<ProcessedTile[]> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (width === undefined || height === undefined) {
      throw new Error('Unable to read image dimensions from metadata');
    }

    const { tilePositions, columns } = this.computeTileGrid(
      width,
      height,
      options.maxTileSize,
      options.overlapPixels,
    );

    const tiles: ProcessedTile[] = [];

    for (const pos of tilePositions) {
      const clamped = this.clampRegion(pos.x, pos.y, pos.w, pos.h, width, height);

      const tileBuffer = await sharp(imageBuffer)
        .extract({
          left: clamped.x,
          top: clamped.y,
          width: clamped.w,
          height: clamped.h,
        })
        .toFormat(options.outputFormat)
        .toBuffer();

      const column = pos.x === 0 ? 0 : Math.floor(pos.x / (options.maxTileSize - options.overlapPixels));
      const row = pos.y === 0 ? 0 : Math.floor(pos.y / (options.maxTileSize - options.overlapPixels));

      tiles.push({
        id: `tile-${row}-${column}`,
        row,
        column,
        bbox: {
          x: clamped.x,
          y: clamped.y,
          width: clamped.w,
          height: clamped.h,
        },
        buffer: tileBuffer,
        hash: this.computeHash(tileBuffer),
      });

      logger.debug('Extracted tile', {
        id: `tile-${row}-${column}`,
        bbox: clamped,
      });
    }

    logger.info('Tile splitting complete', {
      totalTiles: tiles.length,
      columns,
    });

    return tiles;
  }

  // -----------------------------------------------------------------------
  // Public: reassembleTiles
  // -----------------------------------------------------------------------
  async reassembleTiles(
    tiles: ProcessedTile[],
    grid: { columns: number; rows: number },
    overlapPixels: number,
    outputWidth: number,
    outputHeight: number,
  ): Promise<Buffer> {
    logger.info('Reassembling tiles', {
      tileCount: tiles.length,
      grid,
      outputWidth,
      outputHeight,
    });

    if (tiles.length === 0) {
      throw new Error('No tiles provided for reassembly');
    }

    const halfOverlap = Math.floor(overlapPixels / 2);

    const compositeInputs: sharp.OverlayOptions[] = [];

    for (const tile of tiles) {
      // For overlap blending we crop each tile to the center of its overlap
      // region so that seams are avoided.
      const isFirstCol = tile.column === 0;
      const isFirstRow = tile.row === 0;
      const isLastCol = tile.column === grid.columns - 1;
      const isLastRow = tile.row === grid.rows - 1;

      const cropLeft = isFirstCol ? 0 : halfOverlap;
      const cropTop = isFirstRow ? 0 : halfOverlap;
      const cropRight = isLastCol ? 0 : halfOverlap;
      const cropBottom = isLastRow ? 0 : halfOverlap;

      const croppedWidth = tile.bbox.width - cropLeft - cropRight;
      const croppedHeight = tile.bbox.height - cropTop - cropBottom;

      if (croppedWidth <= 0 || croppedHeight <= 0) {
        logger.warn('Skipping degenerate tile after overlap crop', {
          id: tile.id,
        });
        continue;
      }

      const croppedBuffer = await sharp(tile.buffer)
        .extract({
          left: cropLeft,
          top: cropTop,
          width: croppedWidth,
          height: croppedHeight,
        })
        .toBuffer();

      compositeInputs.push({
        input: croppedBuffer,
        left: tile.bbox.x + cropLeft,
        top: tile.bbox.y + cropTop,
      });
    }

    const result = await sharp({
      create: {
        width: outputWidth,
        height: outputHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(compositeInputs)
      .png()
      .toBuffer();

    logger.info('Reassembly complete', { outputBytes: result.length });
    return result;
  }

  // -----------------------------------------------------------------------
  // Public: multiScaleAnalyze
  // -----------------------------------------------------------------------
  async multiScaleAnalyze(
    imageBuffer: Buffer,
    options: LargeImageOptions,
  ): Promise<MultiScaleAnalysis> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (width === undefined || height === undefined) {
      throw new Error('Unable to read image dimensions from metadata');
    }

    logger.info('Multi-scale analysis', { width, height });

    // Preview
    const previewWidth = Math.max(1, Math.round(width * options.previewScale));
    const previewHeight = Math.max(1, Math.round(height * options.previewScale));
    const previewBuffer = await sharp(imageBuffer)
      .resize(previewWidth, previewHeight, { fit: 'fill' })
      .toFormat(options.outputFormat)
      .toBuffer();

    // Medium — only if original exceeds 4000px in either dimension
    let medium: MultiScaleAnalysis['medium'] = null;
    const MEDIUM_THRESHOLD = 4000;
    if (width > MEDIUM_THRESHOLD || height > MEDIUM_THRESHOLD) {
      const mediumScale = 0.5;
      const mediumWidth = Math.max(1, Math.round(width * mediumScale));
      const mediumHeight = Math.max(1, Math.round(height * mediumScale));
      const mediumBuffer = await sharp(imageBuffer)
        .resize(mediumWidth, mediumHeight, { fit: 'fill' })
        .toFormat(options.outputFormat)
        .toBuffer();

      medium = {
        buffer: mediumBuffer,
        scale: mediumScale,
        width: mediumWidth,
        height: mediumHeight,
      };
    }

    return {
      preview: {
        buffer: previewBuffer,
        scale: options.previewScale,
        width: previewWidth,
        height: previewHeight,
      },
      medium,
      full: { width, height },
    };
  }

  // -----------------------------------------------------------------------
  // Public: createStreamingPipeline
  // -----------------------------------------------------------------------
  createStreamingPipeline(
    totalTiles: number,
    outputWidth: number,
    outputHeight: number,
    options: LargeImageOptions,
  ): StreamingReconstructionPipeline {
    const compositeInputs: sharp.OverlayOptions[] = [];
    let tilesProcessed = 0;
    const outputFormat = options.outputFormat;

    logger.info('Creating streaming pipeline', {
      totalTiles,
      outputWidth,
      outputHeight,
    });

    const pipeline: StreamingReconstructionPipeline = {
      async addTile(tile: ProcessedTile): Promise<void> {
        if (!tile.buffer || tile.buffer.length === 0) {
          throw new Error(`Tile ${tile.id} has an empty buffer`);
        }

        compositeInputs.push({
          input: tile.buffer,
          left: tile.bbox.x,
          top: tile.bbox.y,
        });

        tilesProcessed += 1;
        logger.debug('Tile added to pipeline', {
          id: tile.id,
          tilesProcessed,
          totalTiles,
        });
      },

      async finalize(): Promise<Buffer> {
        logger.info('Finalising streaming pipeline', {
          tilesProcessed,
          totalTiles,
        });

        if (compositeInputs.length === 0) {
          throw new Error('No tiles were added to the pipeline before finalising');
        }

        const result = await sharp({
          create: {
            width: outputWidth,
            height: outputHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite(compositeInputs)
          .toFormat(outputFormat)
          .toBuffer();

        logger.info('Streaming pipeline finalised', {
          outputBytes: result.length,
        });

        return result;
      },

      getProgress(): {
        tilesProcessed: number;
        totalTiles: number;
        memoryUsedMB: number;
      } {
        return {
          tilesProcessed,
          totalTiles,
          memoryUsedMB:
            process.memoryUsage().heapUsed / (1024 * 1024),
        };
      },
    };

    return pipeline;
  }

  // -----------------------------------------------------------------------
  // Public: isLargeImage
  // -----------------------------------------------------------------------
  async isLargeImage(
    imageBuffer: Buffer,
    thresholdPixels: number = 4_000_000,
  ): Promise<{
    isLarge: boolean;
    width: number;
    height: number;
    totalPixels: number;
    estimatedMemoryMB: number;
  }> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (width === undefined || height === undefined) {
      throw new Error('Unable to read image dimensions from metadata');
    }

    const totalPixels = width * height;
    const estimatedMemoryMB = (width * height * 4) / (1024 * 1024);

    return {
      isLarge: totalPixels >= thresholdPixels,
      width,
      height,
      totalPixels,
      estimatedMemoryMB,
    };
  }

  // -----------------------------------------------------------------------
  // Public: optimizeForMemory
  // -----------------------------------------------------------------------
  async optimizeForMemory(
    imageBuffer: Buffer,
    maxMemoryMB: number,
  ): Promise<{
    buffer: Buffer;
    scale: number;
    originalWidth: number;
    originalHeight: number;
  }> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (width === undefined || height === undefined) {
      throw new Error('Unable to read image dimensions from metadata');
    }

    const estimatedMemoryMB = (width * height * 4) / (1024 * 1024);

    if (estimatedMemoryMB <= maxMemoryMB) {
      logger.info('Image fits within memory budget', {
        estimatedMemoryMB,
        maxMemoryMB,
      });
      return {
        buffer: imageBuffer,
        scale: 1,
        originalWidth: width,
        originalHeight: height,
      };
    }

    const scale = Math.sqrt(maxMemoryMB / estimatedMemoryMB);
    const newWidth = Math.max(1, Math.round(width * scale));
    const newHeight = Math.max(1, Math.round(height * scale));

    logger.info('Downscaling image for memory budget', {
      originalWidth: width,
      originalHeight: height,
      newWidth,
      newHeight,
      scale,
      estimatedMemoryMB,
      maxMemoryMB,
    });

    const buffer = await sharp(imageBuffer)
      .resize(newWidth, newHeight, { fit: 'fill' })
      .toBuffer();

    return {
      buffer,
      scale,
      originalWidth: width,
      originalHeight: height,
    };
  }

  // -----------------------------------------------------------------------
  // Private: computeTileGrid
  // -----------------------------------------------------------------------
  private computeTileGrid(
    width: number,
    height: number,
    tileSize: number,
    overlap: number,
  ): {
    columns: number;
    rows: number;
    tilePositions: Array<{ x: number; y: number; w: number; h: number }>;
  } {
    const step = tileSize - overlap;

    if (step <= 0) {
      throw new Error(
        `Overlap (${overlap}) must be smaller than tile size (${tileSize})`,
      );
    }

    const columns = Math.max(1, Math.ceil((width - overlap) / step));
    const rows = Math.max(1, Math.ceil((height - overlap) / step));

    const tilePositions: Array<{ x: number; y: number; w: number; h: number }> =
      [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const x = col * step;
        const y = row * step;
        const w = Math.min(tileSize, width - x);
        const h = Math.min(tileSize, height - y);

        tilePositions.push({ x, y, w, h });
      }
    }

    return { columns, rows, tilePositions };
  }

  // -----------------------------------------------------------------------
  // Private: computeHash
  // -----------------------------------------------------------------------
  private computeHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  // -----------------------------------------------------------------------
  // Private: getMemoryUsageMB
  // -----------------------------------------------------------------------
  private getMemoryUsageMB(): number {
    return process.memoryUsage().heapUsed / (1024 * 1024);
  }

  // -----------------------------------------------------------------------
  // Private: clampRegion
  // -----------------------------------------------------------------------
  private clampRegion(
    x: number,
    y: number,
    w: number,
    h: number,
    maxW: number,
    maxH: number,
  ): { x: number; y: number; w: number; h: number } {
    const clampedX = Math.max(0, Math.min(x, maxW - 1));
    const clampedY = Math.max(0, Math.min(y, maxH - 1));
    const clampedW = Math.max(1, Math.min(w, maxW - clampedX));
    const clampedH = Math.max(1, Math.min(h, maxH - clampedY));

    return { x: clampedX, y: clampedY, w: clampedW, h: clampedH };
  }
}
