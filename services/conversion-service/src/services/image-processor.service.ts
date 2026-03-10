import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  channels: number;
  colorSpace: string;
  density?: number;
  hasAlpha: boolean;
  isAnimated: boolean;
  pages?: number;
  orientation?: number;
  sizeBytes: number;
  checksum: string;
}

interface ResizeOptions {
  width?: number;
  height?: number;
  fit: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position: 'center' | 'top' | 'right top' | 'right' | 'right bottom' | 'bottom' | 'left bottom' | 'left' | 'left top';
  background: { r: number; g: number; b: number; alpha: number };
  withoutEnlargement: boolean;
  withoutReduction: boolean;
  kernel: 'nearest' | 'cubic' | 'mitchell' | 'lanczos2' | 'lanczos3';
}

interface CropOptions {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface RotateOptions {
  angle: number;
  background: { r: number; g: number; b: number; alpha: number };
  withoutEnlargement: boolean;
}

interface WatermarkOptions {
  type: 'text' | 'image';
  text?: string;
  imagePath?: string;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile';
  opacity: number;
  fontSize: number;
  fontColor: string;
  margin: number;
  rotation: number;
  scale: number;
}

interface ThumbnailOptions {
  width: number;
  height: number;
  fit: 'cover' | 'contain' | 'fill';
  format: 'jpeg' | 'png' | 'webp';
  quality: number;
  progressive: boolean;
  stripMetadata: boolean;
}

interface FormatConversionOptions {
  format: 'jpeg' | 'png' | 'webp' | 'tiff' | 'avif' | 'gif' | 'heif';
  quality: number;
  progressive: boolean;
  lossless: boolean;
  effort: number;
  chromaSubsampling: string;
  compression?: 'lzw' | 'deflate' | 'jpeg' | 'none';
  stripMetadata: boolean;
}

interface ImageFilter {
  type: 'blur' | 'sharpen' | 'grayscale' | 'negate' | 'normalize' | 'gamma' | 'tint' | 'modulate' | 'threshold' | 'median' | 'linear' | 'recomb' | 'clahe';
  params: Record<string, any>;
}

interface BatchProcessingResult {
  totalImages: number;
  successCount: number;
  failureCount: number;
  results: SingleProcessingResult[];
  totalTimeMs: number;
  averageTimeMs: number;
}

interface SingleProcessingResult {
  inputPath: string;
  outputPath: string;
  success: boolean;
  error?: string;
  inputMetadata?: ImageMetadata;
  outputMetadata?: ImageMetadata;
  processingTimeMs: number;
  compressionRatio?: number;
}

interface CompositeLayer {
  inputPath: string;
  blend: 'over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';
  left: number;
  top: number;
  opacity: number;
  gravity?: 'center' | 'north' | 'south' | 'east' | 'west';
}

interface SpriteSheetOptions {
  columns: number;
  padding: number;
  background: { r: number; g: number; b: number; alpha: number };
  outputFormat: 'png' | 'jpeg' | 'webp';
  quality: number;
}

interface SpriteSheetResult {
  outputPath: string;
  width: number;
  height: number;
  sprites: Array<{ name: string; x: number; y: number; width: number; height: number }>;
  cssOutput: string;
}

interface ColorAnalysis {
  dominantColors: Array<{ r: number; g: number; b: number; hex: string; percentage: number }>;
  averageColor: { r: number; g: number; b: number; hex: string };
  histogram: { red: number[]; green: number[]; blue: number[] };
  isMonochrome: boolean;
  brightness: number;
  contrast: number;
}

class ImageProcessorService {
  private prisma: PrismaClient;
  private cacheDir: string;
  private processingQueue: Map<string, Promise<unknown>> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.cacheDir = process.env.IMAGE_CACHE_DIR || '/tmp/image-cache';
  }

  async getMetadata(imagePath: string): Promise<ImageMetadata> {
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const stats = await fs.promises.stat(imagePath);

    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(imagePath);
    const checksum = await new Promise<string>((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });

    const result: ImageMetadata = {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      channels: metadata.channels || 0,
      colorSpace: metadata.space || 'unknown',
      density: metadata.density,
      hasAlpha: metadata.hasAlpha || false,
      isAnimated: (metadata.pages || 1) > 1,
      pages: metadata.pages,
      orientation: metadata.orientation,
      sizeBytes: stats.size,
      checksum,
    };

    await this.prisma.activity.create({
      data: {
        type: 'image_metadata_extracted',
        action: `Extracted metadata for ${path.basename(imagePath)}`,
        metadata: {
          filePath: imagePath,
          width: result.width,
          height: result.height,
          format: result.format,
          sizeBytes: result.sizeBytes,
        },
      },
    });

    return result;
  }

  async resize(
    imagePath: string,
    outputPath: string,
    options: Partial<ResizeOptions> = {},
  ): Promise<SingleProcessingResult> {
    const startTime = Date.now();
    const defaultOptions: ResizeOptions = {
      fit: 'cover',
      position: 'center',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
      withoutReduction: false,
      kernel: 'lanczos3',
      ...options,
    };

    try {
      const inputMetadata = await this.getMetadata(imagePath);

      let targetWidth = defaultOptions.width;
      let targetHeight = defaultOptions.height;

      if (targetWidth && !targetHeight) {
        const aspectRatio = inputMetadata.height / inputMetadata.width;
        targetHeight = Math.round(targetWidth * aspectRatio);
      } else if (targetHeight && !targetWidth) {
        const aspectRatio = inputMetadata.width / inputMetadata.height;
        targetWidth = Math.round(targetHeight * aspectRatio);
      }

      if (!targetWidth && !targetHeight) {
        targetWidth = Math.round(inputMetadata.width / 2);
        targetHeight = Math.round(inputMetadata.height / 2);
      }

      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

      await sharp(imagePath)
        .resize({
          width: targetWidth,
          height: targetHeight,
          fit: defaultOptions.fit,
          position: defaultOptions.position,
          background: defaultOptions.background,
          withoutEnlargement: defaultOptions.withoutEnlargement,
          withoutReduction: defaultOptions.withoutReduction,
          kernel: defaultOptions.kernel,
        })
        .toFile(outputPath);

      const outputMetadata = await this.getMetadata(outputPath);
      const processingTimeMs = Date.now() - startTime;

      await this.prisma.activity.create({
        data: {
          type: 'image_resized',
          action: `Resized ${path.basename(imagePath)} to ${targetWidth}x${targetHeight}`,
          metadata: {
            inputPath: imagePath,
            outputPath,
            originalSize: `${inputMetadata.width}x${inputMetadata.height}`,
            newSize: `${outputMetadata.width}x${outputMetadata.height}`,
            fit: defaultOptions.fit,
            processingTimeMs,
          },
        },
      });

      return {
        inputPath: imagePath,
        outputPath,
        success: true,
        inputMetadata,
        outputMetadata,
        processingTimeMs,
        compressionRatio: outputMetadata.sizeBytes / inputMetadata.sizeBytes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        inputPath: imagePath,
        outputPath,
        success: false,
        error: message,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  async crop(
    imagePath: string,
    outputPath: string,
    options: CropOptions,
  ): Promise<SingleProcessingResult> {
    const startTime = Date.now();

    try {
      const inputMetadata = await this.getMetadata(imagePath);

      const safeLeft = Math.max(0, Math.min(options.left, inputMetadata.width - 1));
      const safeTop = Math.max(0, Math.min(options.top, inputMetadata.height - 1));
      const safeWidth = Math.min(options.width, inputMetadata.width - safeLeft);
      const safeHeight = Math.min(options.height, inputMetadata.height - safeTop);

      if (safeWidth <= 0 || safeHeight <= 0) {
        throw new Error(`Invalid crop dimensions: width=${safeWidth}, height=${safeHeight}`);
      }

      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

      await sharp(imagePath)
        .extract({ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight })
        .toFile(outputPath);

      const outputMetadata = await this.getMetadata(outputPath);

      return {
        inputPath: imagePath,
        outputPath,
        success: true,
        inputMetadata,
        outputMetadata,
        processingTimeMs: Date.now() - startTime,
        compressionRatio: outputMetadata.sizeBytes / inputMetadata.sizeBytes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        inputPath: imagePath,
        outputPath,
        success: false,
        error: message,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  async rotate(
    imagePath: string,
    outputPath: string,
    options: Partial<RotateOptions> = {},
  ): Promise<SingleProcessingResult> {
    const startTime = Date.now();
    const defaultOptions: RotateOptions = {
      angle: 90,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
      ...options,
    };

    try {
      const inputMetadata = await this.getMetadata(imagePath);

      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

      await sharp(imagePath)
        .rotate(defaultOptions.angle, {
          background: defaultOptions.background,
        })
        .toFile(outputPath);

      const outputMetadata = await this.getMetadata(outputPath);

      return {
        inputPath: imagePath,
        outputPath,
        success: true,
        inputMetadata,
        outputMetadata,
        processingTimeMs: Date.now() - startTime,
        compressionRatio: outputMetadata.sizeBytes / inputMetadata.sizeBytes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        inputPath: imagePath,
        outputPath,
        success: false,
        error: message,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  async convertFormat(
    imagePath: string,
    outputPath: string,
    options: Partial<FormatConversionOptions> = {},
  ): Promise<SingleProcessingResult> {
    const startTime = Date.now();
    const defaultOptions: FormatConversionOptions = {
      format: 'webp',
      quality: 80,
      progressive: true,
      lossless: false,
      effort: 4,
      chromaSubsampling: '4:4:4',
      stripMetadata: false,
      ...options,
    };

    try {
      const inputMetadata = await this.getMetadata(imagePath);
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

      let pipeline = sharp(imagePath);

      switch (defaultOptions.format) {
        case 'jpeg':
          pipeline = pipeline.jpeg({
            quality: defaultOptions.quality,
            progressive: defaultOptions.progressive,
            chromaSubsampling: defaultOptions.chromaSubsampling,
            mozjpeg: true,
          });
          break;
        case 'png':
          pipeline = pipeline.png({
            progressive: defaultOptions.progressive,
            compressionLevel: Math.round(defaultOptions.effort * 9 / 10),
            effort: defaultOptions.effort,
          });
          break;
        case 'webp':
          pipeline = pipeline.webp({
            quality: defaultOptions.quality,
            lossless: defaultOptions.lossless,
            effort: defaultOptions.effort,
          });
          break;
        case 'tiff':
          pipeline = pipeline.tiff({
            quality: defaultOptions.quality,
            compression: defaultOptions.compression || 'lzw',
          });
          break;
        case 'avif':
          pipeline = pipeline.avif({
            quality: defaultOptions.quality,
            lossless: defaultOptions.lossless,
            effort: defaultOptions.effort,
          });
          break;
        case 'heif':
          pipeline = pipeline.heif({
            quality: defaultOptions.quality,
            lossless: defaultOptions.lossless,
            effort: defaultOptions.effort,
          });
          break;
        case 'gif':
          pipeline = pipeline.gif({
            effort: defaultOptions.effort,
          });
          break;
        default:
          throw new Error(`Unsupported output format: ${defaultOptions.format}`);
      }

      if (defaultOptions.stripMetadata) {
        pipeline = pipeline.withMetadata({});
      } else {
        pipeline = pipeline.withMetadata();
      }

      await pipeline.toFile(outputPath);

      const outputMetadata = await this.getMetadata(outputPath);
      const processingTimeMs = Date.now() - startTime;

      await this.prisma.activity.create({
        data: {
          type: 'image_format_converted',
          action: `Converted ${path.basename(imagePath)} from ${inputMetadata.format} to ${defaultOptions.format}`,
          metadata: {
            inputPath: imagePath,
            outputPath,
            inputFormat: inputMetadata.format,
            outputFormat: defaultOptions.format,
            quality: defaultOptions.quality,
            inputSize: inputMetadata.sizeBytes,
            outputSize: outputMetadata.sizeBytes,
            compressionRatio: (outputMetadata.sizeBytes / inputMetadata.sizeBytes).toFixed(3),
            processingTimeMs,
          },
        },
      });

      return {
        inputPath: imagePath,
        outputPath,
        success: true,
        inputMetadata,
        outputMetadata,
        processingTimeMs,
        compressionRatio: outputMetadata.sizeBytes / inputMetadata.sizeBytes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        inputPath: imagePath,
        outputPath,
        success: false,
        error: message,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  async applyWatermark(
    imagePath: string,
    outputPath: string,
    options: Partial<WatermarkOptions> = {},
  ): Promise<SingleProcessingResult> {
    const startTime = Date.now();
    const defaultOptions: WatermarkOptions = {
      type: 'text',
      text: 'RASID',
      position: 'bottom-right',
      opacity: 0.3,
      fontSize: 48,
      fontColor: '#ffffff',
      margin: 20,
      rotation: 0,
      scale: 1.0,
      ...options,
    };

    try {
      const inputMetadata = await this.getMetadata(imagePath);
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

      let watermarkBuffer: Buffer;

      if (defaultOptions.type === 'image' && defaultOptions.imagePath) {
        const watermarkImage = sharp(defaultOptions.imagePath);
        const watermarkMeta = await watermarkImage.metadata();

        const targetWidth = Math.round((watermarkMeta.width || 100) * defaultOptions.scale);
        const targetHeight = Math.round((watermarkMeta.height || 100) * defaultOptions.scale);

        watermarkBuffer = await sharp(defaultOptions.imagePath)
          .resize(targetWidth, targetHeight)
          .ensureAlpha()
          .composite([{
            input: Buffer.from([0, 0, 0, Math.round(255 * defaultOptions.opacity)]),
            raw: { width: 1, height: 1, channels: 4 },
            tile: true,
            blend: 'dest-in',
          }])
          .toBuffer();
      } else {
        const svgText = this.generateWatermarkSvg(
          defaultOptions.text || 'WATERMARK',
          defaultOptions.fontSize,
          defaultOptions.fontColor,
          defaultOptions.opacity,
          defaultOptions.rotation,
        );
        watermarkBuffer = Buffer.from(svgText);
      }

      const { left, top } = this.calculateWatermarkPosition(
        inputMetadata.width,
        inputMetadata.height,
        defaultOptions.fontSize * (defaultOptions.text?.length || 5) * 0.6,
        defaultOptions.fontSize * 1.2,
        defaultOptions.position,
        defaultOptions.margin,
      );

      if (defaultOptions.position === 'tile') {
        const tileComposites: sharp.OverlayOptions[] = [];
        const tileWidth = Math.round(defaultOptions.fontSize * (defaultOptions.text?.length || 5) * 0.7) + defaultOptions.margin * 2;
        const tileHeight = defaultOptions.fontSize * 2 + defaultOptions.margin * 2;

        for (let y = 0; y < inputMetadata.height; y += tileHeight) {
          for (let x = 0; x < inputMetadata.width; x += tileWidth) {
            tileComposites.push({
              input: watermarkBuffer,
              left: x,
              top: y,
              blend: 'over',
            });
          }
        }

        await sharp(imagePath)
          .composite(tileComposites)
          .toFile(outputPath);
      } else {
        await sharp(imagePath)
          .composite([{
            input: watermarkBuffer,
            left: Math.round(left),
            top: Math.round(top),
            blend: 'over',
          }])
          .toFile(outputPath);
      }

      const outputMetadata = await this.getMetadata(outputPath);

      return {
        inputPath: imagePath,
        outputPath,
        success: true,
        inputMetadata,
        outputMetadata,
        processingTimeMs: Date.now() - startTime,
        compressionRatio: outputMetadata.sizeBytes / inputMetadata.sizeBytes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        inputPath: imagePath,
        outputPath,
        success: false,
        error: message,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  private generateWatermarkSvg(
    text: string,
    fontSize: number,
    color: string,
    opacity: number,
    rotation: number,
  ): string {
    const width = Math.round(fontSize * text.length * 0.7) + 20;
    const height = Math.round(fontSize * 1.5) + 20;
    const centerX = width / 2;
    const centerY = height / 2;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <g transform="rotate(${rotation}, ${centerX}, ${centerY})">
        <text
          x="${centerX}"
          y="${centerY}"
          text-anchor="middle"
          dominant-baseline="central"
          font-family="Arial, sans-serif"
          font-size="${fontSize}"
          font-weight="bold"
          fill="${color}"
          opacity="${opacity}"
        >${this.escapeXml(text)}</text>
      </g>
    </svg>`;
  }

  private escapeXml(text: string): string {
    const xmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return text.replace(/[&<>"']/g, (char) => xmlEntities[char] || char);
  }

  private calculateWatermarkPosition(
    imageWidth: number,
    imageHeight: number,
    watermarkWidth: number,
    watermarkHeight: number,
    position: string,
    margin: number,
  ): { left: number; top: number } {
    const positions: Record<string, { left: number; top: number }> = {
      'center': {
        left: (imageWidth - watermarkWidth) / 2,
        top: (imageHeight - watermarkHeight) / 2,
      },
      'top-left': {
        left: margin,
        top: margin,
      },
      'top-right': {
        left: imageWidth - watermarkWidth - margin,
        top: margin,
      },
      'bottom-left': {
        left: margin,
        top: imageHeight - watermarkHeight - margin,
      },
      'bottom-right': {
        left: imageWidth - watermarkWidth - margin,
        top: imageHeight - watermarkHeight - margin,
      },
      'tile': {
        left: 0,
        top: 0,
      },
    };

    const pos = positions[position] || positions['center'];
    return {
      left: Math.max(0, pos.left),
      top: Math.max(0, pos.top),
    };
  }

  async generateThumbnail(
    imagePath: string,
    outputPath: string,
    options: Partial<ThumbnailOptions> = {},
  ): Promise<SingleProcessingResult> {
    const startTime = Date.now();
    const defaultOptions: ThumbnailOptions = {
      width: 200,
      height: 200,
      fit: 'cover',
      format: 'jpeg',
      quality: 75,
      progressive: true,
      stripMetadata: true,
      ...options,
    };

    try {
      const inputMetadata = await this.getMetadata(imagePath);
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

      let pipeline = sharp(imagePath)
        .resize({
          width: defaultOptions.width,
          height: defaultOptions.height,
          fit: defaultOptions.fit,
          position: 'attention',
        });

      switch (defaultOptions.format) {
        case 'jpeg':
          pipeline = pipeline.jpeg({
            quality: defaultOptions.quality,
            progressive: defaultOptions.progressive,
          });
          break;
        case 'png':
          pipeline = pipeline.png({ progressive: defaultOptions.progressive });
          break;
        case 'webp':
          pipeline = pipeline.webp({ quality: defaultOptions.quality });
          break;
      }

      if (defaultOptions.stripMetadata) {
        pipeline = pipeline.withMetadata({});
      }

      await pipeline.toFile(outputPath);

      const outputMetadata = await this.getMetadata(outputPath);

      await this.prisma.activity.create({
        data: {
          type: 'thumbnail_generated',
          action: `Generated thumbnail for ${path.basename(imagePath)}`,
          metadata: {
            inputPath: imagePath,
            outputPath,
            thumbnailSize: `${defaultOptions.width}x${defaultOptions.height}`,
            format: defaultOptions.format,
            inputSize: inputMetadata.sizeBytes,
            outputSize: outputMetadata.sizeBytes,
          },
        },
      });

      return {
        inputPath: imagePath,
        outputPath,
        success: true,
        inputMetadata,
        outputMetadata,
        processingTimeMs: Date.now() - startTime,
        compressionRatio: outputMetadata.sizeBytes / inputMetadata.sizeBytes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        inputPath: imagePath,
        outputPath,
        success: false,
        error: message,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  async applyFilters(
    imagePath: string,
    outputPath: string,
    filters: ImageFilter[],
  ): Promise<SingleProcessingResult> {
    const startTime = Date.now();

    try {
      const inputMetadata = await this.getMetadata(imagePath);
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

      let pipeline = sharp(imagePath);

      for (const filter of filters) {
        pipeline = this.applyFilter(pipeline, filter);
      }

      await pipeline.toFile(outputPath);

      const outputMetadata = await this.getMetadata(outputPath);

      return {
        inputPath: imagePath,
        outputPath,
        success: true,
        inputMetadata,
        outputMetadata,
        processingTimeMs: Date.now() - startTime,
        compressionRatio: outputMetadata.sizeBytes / inputMetadata.sizeBytes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        inputPath: imagePath,
        outputPath,
        success: false,
        error: message,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  private applyFilter(pipeline: sharp.Sharp, filter: ImageFilter): sharp.Sharp {
    switch (filter.type) {
      case 'blur':
        return pipeline.blur(filter.params.sigma || 3);
      case 'sharpen':
        return pipeline.sharpen({
          sigma: filter.params.sigma || 1,
          m1: filter.params.flat || 1.0,
          m2: filter.params.jagged || 2.0,
        });
      case 'grayscale':
        return pipeline.grayscale(filter.params.enabled !== false);
      case 'negate':
        return pipeline.negate({ alpha: filter.params.alpha || false });
      case 'normalize':
        return pipeline.normalize({
          lower: filter.params.lower || 1,
          upper: filter.params.upper || 99,
        });
      case 'gamma':
        return pipeline.gamma(filter.params.value || 2.2, filter.params.gammaOut);
      case 'tint':
        return pipeline.tint({
          r: filter.params.r || 0,
          g: filter.params.g || 0,
          b: filter.params.b || 0,
        });
      case 'modulate':
        return pipeline.modulate({
          brightness: filter.params.brightness,
          saturation: filter.params.saturation,
          hue: filter.params.hue,
          lightness: filter.params.lightness,
        });
      case 'threshold':
        return pipeline.threshold(filter.params.value || 128, {
          greyscale: filter.params.greyscale !== false,
        });
      case 'median':
        return pipeline.median(filter.params.size || 3);
      case 'linear':
        return pipeline.linear(
          filter.params.multiplier || 1.0,
          filter.params.offset || 0,
        );
      case 'recomb':
        return pipeline.recomb(filter.params.matrix || [
          [0.3588, 0.7044, 0.1368],
          [0.2990, 0.5870, 0.1140],
          [0.2392, 0.4696, 0.0912],
        ]);
      case 'clahe':
        return pipeline.clahe({
          width: filter.params.width || 3,
          height: filter.params.height || 3,
          maxSlope: filter.params.maxSlope || 3,
        });
      default:
        return pipeline;
    }
  }

  async compositeImages(
    basePath: string,
    layers: CompositeLayer[],
    outputPath: string,
  ): Promise<SingleProcessingResult> {
    const startTime = Date.now();

    try {
      const inputMetadata = await this.getMetadata(basePath);
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

      const compositeInputs: sharp.OverlayOptions[] = [];

      for (const layer of layers) {
        const layerBuffer = await sharp(layer.inputPath)
          .ensureAlpha()
          .composite([{
            input: Buffer.from([0, 0, 0, Math.round(255 * layer.opacity)]),
            raw: { width: 1, height: 1, channels: 4 },
            tile: true,
            blend: 'dest-in',
          }])
          .toBuffer();

        compositeInputs.push({
          input: layerBuffer,
          left: layer.left,
          top: layer.top,
          blend: layer.blend,
          gravity: layer.gravity,
        });
      }

      await sharp(basePath)
        .composite(compositeInputs)
        .toFile(outputPath);

      const outputMetadata = await this.getMetadata(outputPath);

      return {
        inputPath: basePath,
        outputPath,
        success: true,
        inputMetadata,
        outputMetadata,
        processingTimeMs: Date.now() - startTime,
        compressionRatio: outputMetadata.sizeBytes / inputMetadata.sizeBytes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        inputPath: basePath,
        outputPath,
        success: false,
        error: message,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  async generateSpriteSheet(
    imagePaths: string[],
    outputPath: string,
    options: Partial<SpriteSheetOptions> = {},
  ): Promise<SpriteSheetResult> {
    const defaultOptions: SpriteSheetOptions = {
      columns: 8,
      padding: 2,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      outputFormat: 'png',
      quality: 90,
      ...options,
    };

    const imageDimensions: Array<{ path: string; width: number; height: number; name: string }> = [];

    for (const imgPath of imagePaths) {
      const meta = await sharp(imgPath).metadata();
      imageDimensions.push({
        path: imgPath,
        width: meta.width || 0,
        height: meta.height || 0,
        name: path.basename(imgPath, path.extname(imgPath)),
      });
    }

    const maxWidth = Math.max(...imageDimensions.map(d => d.width));
    const maxHeight = Math.max(...imageDimensions.map(d => d.height));
    const cellWidth = maxWidth + defaultOptions.padding * 2;
    const cellHeight = maxHeight + defaultOptions.padding * 2;
    const columns = Math.min(defaultOptions.columns, imageDimensions.length);
    const rows = Math.ceil(imageDimensions.length / columns);

    const sheetWidth = columns * cellWidth;
    const sheetHeight = rows * cellHeight;

    const compositeInputs: sharp.OverlayOptions[] = [];
    const sprites: Array<{ name: string; x: number; y: number; width: number; height: number }> = [];

    for (let i = 0; i < imageDimensions.length; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = col * cellWidth + defaultOptions.padding;
      const y = row * cellHeight + defaultOptions.padding;

      const imgBuffer = await sharp(imageDimensions[i].path)
        .resize(maxWidth, maxHeight, { fit: 'contain', background: defaultOptions.background })
        .toBuffer();

      compositeInputs.push({
        input: imgBuffer,
        left: x,
        top: y,
      });

      sprites.push({
        name: imageDimensions[i].name,
        x,
        y,
        width: imageDimensions[i].width,
        height: imageDimensions[i].height,
      });
    }

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    let pipeline = sharp({
      create: {
        width: sheetWidth,
        height: sheetHeight,
        channels: 4,
        background: defaultOptions.background,
      },
    }).composite(compositeInputs);

    switch (defaultOptions.outputFormat) {
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality: defaultOptions.quality });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality: defaultOptions.quality });
        break;
      case 'png':
      default:
        pipeline = pipeline.png();
        break;
    }

    await pipeline.toFile(outputPath);

    const cssLines: string[] = [];
    cssLines.push(`.sprite { background-image: url('${path.basename(outputPath)}'); background-repeat: no-repeat; display: inline-block; }`);
    for (const sprite of sprites) {
      cssLines.push(`.sprite-${sprite.name} { width: ${sprite.width}px; height: ${sprite.height}px; background-position: -${sprite.x}px -${sprite.y}px; }`);
    }

    return {
      outputPath,
      width: sheetWidth,
      height: sheetHeight,
      sprites,
      cssOutput: cssLines.join('\n'),
    };
  }

  async analyzeColors(imagePath: string, sampleSize: number = 10000): Promise<ColorAnalysis> {
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const width = metadata.width || 1;
    const height = metadata.height || 1;

    const sampleWidth = Math.min(width, Math.round(Math.sqrt(sampleSize * (width / height))));
    const sampleHeight = Math.min(height, Math.round(Math.sqrt(sampleSize * (height / width))));

    const { data, info } = await image
      .resize(sampleWidth, sampleHeight, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    const pixels = info.width * info.height;

    const histogram = {
      red: new Array(256).fill(0),
      green: new Array(256).fill(0),
      blue: new Array(256).fill(0),
    };

    let totalR = 0, totalG = 0, totalB = 0;
    const colorBuckets: Map<string, { r: number; g: number; b: number; count: number }> = new Map();

    for (let i = 0; i < pixels; i++) {
      const offset = i * channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];

      histogram.red[r]++;
      histogram.green[g]++;
      histogram.blue[b]++;

      totalR += r;
      totalG += g;
      totalB += b;

      const bucketR = Math.round(r / 32) * 32;
      const bucketG = Math.round(g / 32) * 32;
      const bucketB = Math.round(b / 32) * 32;
      const key = `${bucketR}-${bucketG}-${bucketB}`;

      const existing = colorBuckets.get(key);
      if (existing) {
        existing.r = (existing.r * existing.count + r) / (existing.count + 1);
        existing.g = (existing.g * existing.count + g) / (existing.count + 1);
        existing.b = (existing.b * existing.count + b) / (existing.count + 1);
        existing.count++;
      } else {
        colorBuckets.set(key, { r, g, b, count: 1 });
      }
    }

    const sortedBuckets = Array.from(colorBuckets.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const dominantColors = sortedBuckets.map(bucket => {
      const rr = Math.round(bucket.r);
      const gg = Math.round(bucket.g);
      const bb = Math.round(bucket.b);
      return {
        r: rr,
        g: gg,
        b: bb,
        hex: `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`,
        percentage: Math.round((bucket.count / pixels) * 10000) / 100,
      };
    });

    const avgR = Math.round(totalR / pixels);
    const avgG = Math.round(totalG / pixels);
    const avgB = Math.round(totalB / pixels);

    let isMonochrome = true;
    for (let i = 0; i < pixels && isMonochrome; i++) {
      const offset = i * channels;
      const maxDiff = Math.max(
        Math.abs(data[offset] - data[offset + 1]),
        Math.abs(data[offset + 1] - data[offset + 2]),
        Math.abs(data[offset] - data[offset + 2]),
      );
      if (maxDiff > 15) {
        isMonochrome = false;
      }
    }

    let minLum = 255, maxLum = 0;
    let totalLum = 0;
    for (let i = 0; i < pixels; i++) {
      const offset = i * channels;
      const lum = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
      totalLum += lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const brightness = Math.round((totalLum / pixels / 255) * 100);
    const contrast = Math.round(((maxLum - minLum) / 255) * 100);

    return {
      dominantColors,
      averageColor: {
        r: avgR,
        g: avgG,
        b: avgB,
        hex: `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`,
      },
      histogram,
      isMonochrome,
      brightness,
      contrast,
    };
  }

  async batchProcess(
    imagePaths: string[],
    outputDir: string,
    operations: Array<{
      type: 'resize' | 'crop' | 'rotate' | 'convert' | 'thumbnail' | 'filter' | 'watermark';
      options: Record<string, any>;
    }>,
    concurrency: number = 4,
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const results: SingleProcessingResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    await fs.promises.mkdir(outputDir, { recursive: true });

    const chunks: string[][] = [];
    for (let i = 0; i < imagePaths.length; i += concurrency) {
      chunks.push(imagePaths.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (imgPath) => {
        const baseName = path.basename(imgPath, path.extname(imgPath));
        let currentInput = imgPath;
        let lastResult: SingleProcessingResult | null = null;

        for (let opIdx = 0; opIdx < operations.length; opIdx++) {
          const op = operations[opIdx];
          const isLast = opIdx === operations.length - 1;
          const suffix = isLast ? '' : `_step${opIdx}`;
          const ext = op.type === 'convert' ? `.${op.options.format || 'webp'}` : path.extname(imgPath);
          const outputPath = path.join(outputDir, `${baseName}${suffix}${ext}`);

          let result: SingleProcessingResult;

          switch (op.type) {
            case 'resize':
              result = await this.resize(currentInput, outputPath, op.options);
              break;
            case 'crop':
              result = await this.crop(currentInput, outputPath, op.options as CropOptions);
              break;
            case 'rotate':
              result = await this.rotate(currentInput, outputPath, op.options);
              break;
            case 'convert':
              result = await this.convertFormat(currentInput, outputPath, op.options);
              break;
            case 'thumbnail':
              result = await this.generateThumbnail(currentInput, outputPath, op.options);
              break;
            case 'filter':
              result = await this.applyFilters(currentInput, outputPath, op.options.filters || []);
              break;
            case 'watermark':
              result = await this.applyWatermark(currentInput, outputPath, op.options);
              break;
            default:
              result = {
                inputPath: currentInput,
                outputPath,
                success: false,
                error: `Unknown operation: ${op.type}`,
                processingTimeMs: 0,
              };
          }

          if (!result.success) {
            lastResult = result;
            break;
          }

          if (!isLast && lastResult) {
            await fs.promises.unlink(lastResult.outputPath).catch(() => {});
          }

          currentInput = outputPath;
          lastResult = result;
        }

        if (lastResult) {
          if (lastResult.success) {
            successCount++;
          } else {
            failureCount++;
          }
          results.push(lastResult);
        }
      });

      await Promise.all(promises);
    }

    const totalTimeMs = Date.now() - startTime;

    await this.prisma.activity.create({
      data: {
        type: 'batch_image_processing',
        action: `Batch processed ${imagePaths.length} images: ${successCount} success, ${failureCount} failed`,
        metadata: {
          totalImages: imagePaths.length,
          successCount,
          failureCount,
          totalTimeMs,
          operations: operations.map(o => o.type),
        },
      },
    });

    return {
      totalImages: imagePaths.length,
      successCount,
      failureCount,
      results,
      totalTimeMs,
      averageTimeMs: imagePaths.length > 0 ? totalTimeMs / imagePaths.length : 0,
    };
  }

  async optimizeForWeb(
    imagePath: string,
    outputDir: string,
    breakpoints: number[] = [320, 640, 768, 1024, 1280, 1920],
  ): Promise<{ variants: SingleProcessingResult[]; htmlSrcSet: string }> {
    await fs.promises.mkdir(outputDir, { recursive: true });

    const inputMetadata = await this.getMetadata(imagePath);
    const baseName = path.basename(imagePath, path.extname(imagePath));
    const variants: SingleProcessingResult[] = [];
    const srcSetEntries: string[] = [];

    for (const width of breakpoints) {
      if (width > inputMetadata.width) {
        continue;
      }

      const webpPath = path.join(outputDir, `${baseName}-${width}w.webp`);
      const result = await this.resize(imagePath, webpPath, {
        width,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3',
      });

      if (result.success) {
        await sharp(webpPath)
          .webp({ quality: 80, effort: 6 })
          .toFile(webpPath + '.tmp');
        await fs.promises.rename(webpPath + '.tmp', webpPath);

        variants.push(result);
        srcSetEntries.push(`${path.basename(webpPath)} ${width}w`);
      }
    }

    const fallbackPath = path.join(outputDir, `${baseName}-fallback.jpeg`);
    const fallbackResult = await this.convertFormat(imagePath, fallbackPath, {
      format: 'jpeg',
      quality: 85,
      progressive: true,
    });
    if (fallbackResult.success) {
      variants.push(fallbackResult);
    }

    const sizes = breakpoints
      .filter(w => w <= inputMetadata.width)
      .map(w => `(max-width: ${w}px) ${w}px`)
      .join(', ');

    const htmlSrcSet = `<picture>
  <source
    type="image/webp"
    srcset="${srcSetEntries.join(',\n           ')}"
    sizes="${sizes}"
  />
  <img
    src="${path.basename(fallbackPath)}"
    alt=""
    loading="lazy"
    decoding="async"
    width="${inputMetadata.width}"
    height="${inputMetadata.height}"
  />
</picture>`;

    return { variants, htmlSrcSet };
  }

  async cleanupCache(): Promise<{ deletedFiles: number; freedBytes: number }> {
    let deletedFiles = 0;
    let freedBytes = 0;

    const cacheExists = await fs.promises.access(this.cacheDir)
      .then(() => true)
      .catch(() => false);

    if (!cacheExists) {
      return { deletedFiles, freedBytes };
    }

    const files = await fs.promises.readdir(this.cacheDir);
    const now = Date.now();
    const maxAgeMs = 24 * 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(this.cacheDir, file);
      const stats = await fs.promises.stat(filePath).catch(() => null);

      if (stats && now - stats.mtimeMs > maxAgeMs) {
        await fs.promises.unlink(filePath).catch(() => {});
        deletedFiles++;
        freedBytes += stats.size;
      }
    }

    return { deletedFiles, freedBytes };
  }
}

export default ImageProcessorService;
