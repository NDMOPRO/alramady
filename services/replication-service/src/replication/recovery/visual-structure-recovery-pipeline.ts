import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PipelineConfig {
  segmentationThreshold: number;
  clusteringEpsilon: number;
  inferenceMinConfidence: number;
  layoutReconstructionGridSize: number;
  constraintSolvingMaxIterations: number;
  pixelDiffTolerance: number;
  containerWidth: number;
  containerHeight: number;
  enableDebugOutput: boolean;
}

export interface SegmentedRegion {
  id: string;
  bbox: { x: number; y: number; width: number; height: number };
  type: string;
  confidence: number;
  pixelDensity: number;
  edgeProfile: number[];
  colorHistogram: number[];
  parentId: string | null;
}

export interface ElementCluster {
  id: string;
  elements: SegmentedRegion[];
  centroid: { x: number; y: number };
  boundingBox: { x: number; y: number; width: number; height: number };
  clusterType: string;
  cohesion: number;
}

export interface SemanticLabel {
  clusterId: string;
  label: string;
  confidence: number;
  properties: Record<string, unknown>;
}

export interface ReconstructedLayout {
  nodes: LayoutBlock[];
  hierarchy: HierarchyNode[];
  containerWidth: number;
  containerHeight: number;
}

export interface LayoutBlock {
  id: string;
  type: string;
  semanticLabel: string;
  bbox: { x: number; y: number; width: number; height: number };
  zIndex: number;
  children: string[];
  confidence: number;
  properties: Record<string, unknown>;
}

export interface HierarchyNode {
  id: string;
  parentId: string | null;
  childIds: string[];
  depth: number;
}

export interface SolvedConstraint {
  elementId: string;
  property: string;
  value: number;
  unit: string;
  expression: string;
}

export interface ConstraintSolution {
  constraints: SolvedConstraint[];
  residual: number;
  iterations: number;
  converged: boolean;
}

export interface PixelDiffResult {
  diffPercentage: number;
  totalPixels: number;
  mismatchedPixels: number;
  hotspots: Array<{ x: number; y: number; w: number; h: number; severity: number }>;
}

export interface RecoveryResult {
  success: boolean;
  layout: ReconstructedLayout;
  constraints: ConstraintSolution;
  pixelValidation: PixelDiffResult;
  stages: StageResult[];
  hash: string;
  elapsedMs: number;
}

export interface StageResult {
  name: string;
  success: boolean;
  elapsedMs: number;
  outputSummary: Record<string, unknown>;
}

const DEFAULT_CONFIG: PipelineConfig = {
  segmentationThreshold: 0.5,
  clusteringEpsilon: 24,
  inferenceMinConfidence: 0.6,
  layoutReconstructionGridSize: 4,
  constraintSolvingMaxIterations: 100,
  pixelDiffTolerance: 0.001,
  containerWidth: 1920,
  containerHeight: 1080,
  enableDebugOutput: false,
};

// ─── Pipeline ────────────────────────────────────────────────────────────────

export class VisualStructureRecoveryPipeline {
  private readonly config: PipelineConfig;

  constructor(config?: Partial<PipelineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('VisualStructureRecoveryPipeline initialized', {
      containerWidth: this.config.containerWidth,
      containerHeight: this.config.containerHeight,
    });
  }

  async executePipeline(imageBuffer: Buffer, config?: Partial<PipelineConfig>): Promise<RecoveryResult> {
    const mergedConfig = { ...this.config, ...config };
    logger.info('Executing visual structure recovery pipeline', {
      imageSize: imageBuffer.length,
    });
    const pipelineStart = Date.now();
    const stages: StageResult[] = [];

    // Stage 1: Vision Segmentation
    const stage1Start = Date.now();
    const segments = this.visionSegmentation(imageBuffer, mergedConfig);
    stages.push({
      name: 'visionSegmentation',
      success: segments.length > 0,
      elapsedMs: Date.now() - stage1Start,
      outputSummary: { segmentCount: segments.length },
    });

    // Stage 2: Element Clustering
    const stage2Start = Date.now();
    const clusters = this.elementClustering(segments, mergedConfig);
    stages.push({
      name: 'elementClustering',
      success: clusters.length > 0,
      elapsedMs: Date.now() - stage2Start,
      outputSummary: { clusterCount: clusters.length },
    });

    // Stage 3: Semantic Inference
    const stage3Start = Date.now();
    const labels = this.semanticInference(clusters, mergedConfig);
    stages.push({
      name: 'semanticInference',
      success: labels.length > 0,
      elapsedMs: Date.now() - stage3Start,
      outputSummary: { labelCount: labels.length },
    });

    // Stage 4: Layout Reconstruction
    const stage4Start = Date.now();
    const layout = this.layoutReconstruction(clusters, labels, mergedConfig);
    stages.push({
      name: 'layoutReconstruction',
      success: layout.nodes.length > 0,
      elapsedMs: Date.now() - stage4Start,
      outputSummary: { nodeCount: layout.nodes.length, hierarchyDepth: Math.max(...layout.hierarchy.map((h) => h.depth), 0) },
    });

    // Stage 5: Constraint Solving
    const stage5Start = Date.now();
    const constraintSolution = this.constraintSolving(layout, mergedConfig);
    stages.push({
      name: 'constraintSolving',
      success: constraintSolution.converged,
      elapsedMs: Date.now() - stage5Start,
      outputSummary: { constraintCount: constraintSolution.constraints.length, residual: constraintSolution.residual, converged: constraintSolution.converged },
    });

    // Stage 6: Pixel Diff Validation
    const stage6Start = Date.now();
    const pixelValidation = this.pixelDiffValidation(imageBuffer, layout, mergedConfig);
    stages.push({
      name: 'pixelDiffValidation',
      success: pixelValidation.diffPercentage <= mergedConfig.pixelDiffTolerance,
      elapsedMs: Date.now() - stage6Start,
      outputSummary: { diffPercentage: pixelValidation.diffPercentage, hotspotCount: pixelValidation.hotspots.length },
    });

    const resultHash = crypto.createHash('sha256')
      .update(JSON.stringify({ layout: layout.nodes.length, constraints: constraintSolution.constraints.length, diff: pixelValidation.diffPercentage }))
      .digest('hex');

    const result: RecoveryResult = {
      success: stages.every((s) => s.success),
      layout,
      constraints: constraintSolution,
      pixelValidation,
      stages,
      hash: resultHash,
      elapsedMs: Date.now() - pipelineStart,
    };

    logger.info('Pipeline execution complete', {
      success: result.success,
      stagesCompleted: stages.filter((s) => s.success).length,
      totalStages: stages.length,
      elapsedMs: result.elapsedMs,
    });

    return result;
  }

  private visionSegmentation(imageBuffer: Buffer, config: PipelineConfig): SegmentedRegion[] {
    logger.debug('Stage 1: Vision Segmentation');
    const regions: SegmentedRegion[] = [];
    const width = config.containerWidth;
    const height = config.containerHeight;
    const bytesPerPixel = Math.max(1, Math.floor(imageBuffer.length / (width * height)) || 4);
    const actualWidth = Math.floor(Math.sqrt(imageBuffer.length / bytesPerPixel * (width / height)));
    const actualHeight = Math.floor(imageBuffer.length / (actualWidth * bytesPerPixel));
    const blockSize = 64;
    let regionId = 0;

    for (let by = 0; by < actualHeight; by += blockSize) {
      for (let bx = 0; bx < actualWidth; bx += blockSize) {
        const bw = Math.min(blockSize, actualWidth - bx);
        const bh = Math.min(blockSize, actualHeight - by);
        let totalIntensity = 0;
        let pixelCount = 0;
        const histogram = new Array(8).fill(0);

        for (let py = by; py < by + bh && py < actualHeight; py++) {
          for (let px = bx; px < bx + bw && px < actualWidth; px++) {
            const offset = (py * actualWidth + px) * bytesPerPixel;
            if (offset + 2 < imageBuffer.length) {
              const r = imageBuffer[offset];
              const g = imageBuffer[offset + 1];
              const b = imageBuffer[offset + 2];
              const intensity = (r + g + b) / 3;
              totalIntensity += intensity;
              pixelCount++;
              histogram[Math.min(7, Math.floor(intensity / 32))]++;
            }
          }
        }

        const avgIntensity = pixelCount > 0 ? totalIntensity / pixelCount : 0;
        const variance = this.computeBlockVariance(imageBuffer, bx, by, bw, bh, actualWidth, bytesPerPixel, avgIntensity);
        const density = variance / 255;

        if (density > config.segmentationThreshold * 0.1) {
          regionId++;
          regions.push({
            id: `region_${regionId}`,
            bbox: { x: bx, y: by, width: bw, height: bh },
            type: this.classifyRegionByDensity(density, bw / bh),
            confidence: Math.min(1, density * 2 + 0.3),
            pixelDensity: density,
            edgeProfile: this.computeEdgeProfile(imageBuffer, bx, by, bw, bh, actualWidth, bytesPerPixel),
            colorHistogram: histogram,
            parentId: null,
          });
        }
      }
    }

    return regions;
  }

  private computeBlockVariance(
    buffer: Buffer, bx: number, by: number, bw: number, bh: number,
    imgWidth: number, bpp: number, mean: number,
  ): number {
    let sumSq = 0;
    let count = 0;
    for (let py = by; py < by + bh; py++) {
      for (let px = bx; px < bx + bw; px++) {
        const offset = (py * imgWidth + px) * bpp;
        if (offset + 2 < buffer.length) {
          const intensity = (buffer[offset] + buffer[offset + 1] + buffer[offset + 2]) / 3;
          sumSq += (intensity - mean) ** 2;
          count++;
        }
      }
    }
    return count > 0 ? Math.sqrt(sumSq / count) : 0;
  }

  private computeEdgeProfile(
    buffer: Buffer, bx: number, by: number, bw: number, bh: number,
    imgWidth: number, bpp: number,
  ): number[] {
    const profile = new Array(4).fill(0); // top, right, bottom, left edges
    const sampleCount = Math.min(bw, bh, 8);

    for (let i = 0; i < sampleCount; i++) {
      const t = i / Math.max(sampleCount - 1, 1);
      // Top edge
      const topOffset = (by * imgWidth + bx + Math.floor(t * (bw - 1))) * bpp;
      if (topOffset + 2 < buffer.length) profile[0] += (buffer[topOffset] + buffer[topOffset + 1] + buffer[topOffset + 2]) / 3;
      // Bottom edge
      const botOffset = ((by + bh - 1) * imgWidth + bx + Math.floor(t * (bw - 1))) * bpp;
      if (botOffset + 2 < buffer.length) profile[2] += (buffer[botOffset] + buffer[botOffset + 1] + buffer[botOffset + 2]) / 3;
      // Left edge
      const leftOffset = ((by + Math.floor(t * (bh - 1))) * imgWidth + bx) * bpp;
      if (leftOffset + 2 < buffer.length) profile[3] += (buffer[leftOffset] + buffer[leftOffset + 1] + buffer[leftOffset + 2]) / 3;
      // Right edge
      const rightOffset = ((by + Math.floor(t * (bh - 1))) * imgWidth + bx + bw - 1) * bpp;
      if (rightOffset + 2 < buffer.length) profile[1] += (buffer[rightOffset] + buffer[rightOffset + 1] + buffer[rightOffset + 2]) / 3;
    }

    return profile.map((v) => parseFloat((v / Math.max(sampleCount, 1)).toFixed(2)));
  }

  private classifyRegionByDensity(density: number, aspectRatio: number): string {
    if (density > 0.7) return 'image';
    if (density > 0.4 && aspectRatio > 1.5) return 'chart';
    if (density > 0.3 && aspectRatio < 0.5) return 'sidebar';
    if (density > 0.2) return 'text';
    if (aspectRatio > 5) return 'separator';
    return 'container';
  }

  private elementClustering(regions: SegmentedRegion[], config: PipelineConfig): ElementCluster[] {
    logger.debug('Stage 2: Element Clustering');
    const clusters: ElementCluster[] = [];
    const assigned = new Set<string>();
    const epsilon = config.clusteringEpsilon;

    const sorted = [...regions].sort((a, b) => {
      const rowA = Math.floor(a.bbox.y / epsilon);
      const rowB = Math.floor(b.bbox.y / epsilon);
      return rowA !== rowB ? rowA - rowB : a.bbox.x - b.bbox.x;
    });

    for (const region of sorted) {
      if (assigned.has(region.id)) continue;

      const clusterMembers: SegmentedRegion[] = [region];
      assigned.add(region.id);

      for (const candidate of sorted) {
        if (assigned.has(candidate.id)) continue;
        const dist = this.euclideanDistance(
          region.bbox.x + region.bbox.width / 2, region.bbox.y + region.bbox.height / 2,
          candidate.bbox.x + candidate.bbox.width / 2, candidate.bbox.y + candidate.bbox.height / 2,
        );
        if (dist <= epsilon && region.type === candidate.type) {
          clusterMembers.push(candidate);
          assigned.add(candidate.id);
        }
      }

      const bbox = this.computeClusterBounds(clusterMembers);
      const centroid = {
        x: bbox.x + bbox.width / 2,
        y: bbox.y + bbox.height / 2,
      };
      const cohesion = clusterMembers.length > 1
        ? 1 - (this.computeSpread(clusterMembers) / Math.max(bbox.width, bbox.height, 1))
        : 1;

      clusters.push({
        id: `cluster_${clusters.length + 1}`,
        elements: clusterMembers,
        centroid,
        boundingBox: bbox,
        clusterType: this.majorityType(clusterMembers),
        cohesion: parseFloat(Math.max(0, Math.min(1, cohesion)).toFixed(4)),
      });
    }

    return clusters;
  }

  private euclideanDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  private computeClusterBounds(regions: SegmentedRegion[]): { x: number; y: number; width: number; height: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of regions) {
      minX = Math.min(minX, r.bbox.x);
      minY = Math.min(minY, r.bbox.y);
      maxX = Math.max(maxX, r.bbox.x + r.bbox.width);
      maxY = Math.max(maxY, r.bbox.y + r.bbox.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  private computeSpread(regions: SegmentedRegion[]): number {
    if (regions.length < 2) return 0;
    const centers = regions.map((r) => ({ x: r.bbox.x + r.bbox.width / 2, y: r.bbox.y + r.bbox.height / 2 }));
    const avgX = centers.reduce((s, c) => s + c.x, 0) / centers.length;
    const avgY = centers.reduce((s, c) => s + c.y, 0) / centers.length;
    return Math.sqrt(centers.reduce((s, c) => s + (c.x - avgX) ** 2 + (c.y - avgY) ** 2, 0) / centers.length);
  }

  private majorityType(regions: SegmentedRegion[]): string {
    const counts = new Map<string, number>();
    for (const r of regions) {
      counts.set(r.type, (counts.get(r.type) || 0) + 1);
    }
    let maxType = 'container';
    let maxCount = 0;
    for (const [type, count] of counts) {
      if (count > maxCount) { maxType = type; maxCount = count; }
    }
    return maxType;
  }

  private semanticInference(clusters: ElementCluster[], config: PipelineConfig): SemanticLabel[] {
    logger.debug('Stage 3: Semantic Inference');
    const labels: SemanticLabel[] = [];

    for (const cluster of clusters) {
      const aspectRatio = cluster.boundingBox.width / Math.max(cluster.boundingBox.height, 1);
      const area = cluster.boundingBox.width * cluster.boundingBox.height;
      const containerArea = config.containerWidth * config.containerHeight;
      const areaProportion = area / containerArea;
      const avgDensity = cluster.elements.reduce((s, e) => s + e.pixelDensity, 0) / Math.max(cluster.elements.length, 1);

      let label = 'unknown';
      let confidence = 0.5;
      const properties: Record<string, unknown> = { aspectRatio, areaProportion, avgDensity };

      if (areaProportion < 0.05 && aspectRatio > 0.5 && aspectRatio < 2.5) {
        label = 'kpi_card';
        confidence = 0.85;
      } else if (aspectRatio > 1.2 && avgDensity > 0.3 && areaProportion > 0.05) {
        label = 'chart';
        confidence = 0.8;
        properties.chartType = aspectRatio > 2 ? 'bar' : 'pie';
      } else if (avgDensity > 0.15 && aspectRatio > 2 && cluster.elements.length > 4) {
        label = 'table';
        confidence = 0.82;
      } else if (cluster.boundingBox.y < config.containerHeight * 0.1) {
        label = 'header';
        confidence = 0.75;
      } else if (cluster.boundingBox.x < config.containerWidth * 0.15 && cluster.boundingBox.height > config.containerHeight * 0.5) {
        label = 'sidebar';
        confidence = 0.78;
      } else if (areaProportion < 0.02 && cluster.boundingBox.y < config.containerHeight * 0.15) {
        label = 'filter';
        confidence = 0.7;
      } else if (avgDensity < 0.1 && cluster.elements.length <= 2) {
        label = 'spacer';
        confidence = 0.6;
      } else {
        label = cluster.clusterType;
        confidence = 0.55;
      }

      if (confidence >= config.inferenceMinConfidence) {
        labels.push({ clusterId: cluster.id, label, confidence, properties });
      }
    }

    return labels;
  }

  private layoutReconstruction(clusters: ElementCluster[], labels: SemanticLabel[], config: PipelineConfig): ReconstructedLayout {
    logger.debug('Stage 4: Layout Reconstruction');
    const labelMap = new Map<string, SemanticLabel>();
    for (const label of labels) {
      labelMap.set(label.clusterId, label);
    }

    const nodes: LayoutBlock[] = [];
    const hierarchy: HierarchyNode[] = [];
    const gridSize = config.layoutReconstructionGridSize;

    // Create root node
    const rootId = 'root';
    hierarchy.push({ id: rootId, parentId: null, childIds: [], depth: 0 });

    for (const cluster of clusters) {
      const label = labelMap.get(cluster.id);
      const block: LayoutBlock = {
        id: cluster.id,
        type: cluster.clusterType,
        semanticLabel: label?.label || 'unknown',
        bbox: {
          x: Math.round(cluster.boundingBox.x / gridSize) * gridSize,
          y: Math.round(cluster.boundingBox.y / gridSize) * gridSize,
          width: Math.max(Math.round(cluster.boundingBox.width / gridSize) * gridSize, gridSize),
          height: Math.max(Math.round(cluster.boundingBox.height / gridSize) * gridSize, gridSize),
        },
        zIndex: this.computeBlockZIndex(cluster, label),
        children: [],
        confidence: label?.confidence || cluster.cohesion,
        properties: label?.properties || {},
      };
      nodes.push(block);

      const parentId = this.findParentBlock(block, nodes);
      if (parentId) {
        const parentNode = nodes.find((n) => n.id === parentId);
        if (parentNode) parentNode.children.push(block.id);
      }

      hierarchy.push({
        id: cluster.id,
        parentId: parentId || rootId,
        childIds: [],
        depth: parentId ? 2 : 1,
      });

      const rootHierarchy = hierarchy.find((h) => h.id === rootId);
      if (rootHierarchy && !parentId) {
        rootHierarchy.childIds.push(cluster.id);
      }
    }

    return {
      nodes,
      hierarchy,
      containerWidth: config.containerWidth,
      containerHeight: config.containerHeight,
    };
  }

  private computeBlockZIndex(cluster: ElementCluster, label: SemanticLabel | undefined): number {
    const role = label?.label || '';
    if (role === 'header') return 50;
    if (role === 'sidebar') return 40;
    if (role === 'filter') return 60;
    if (role === 'chart' || role === 'table') return 20;
    if (role === 'kpi_card') return 30;
    return 10 + Math.floor(cluster.centroid.y / 100);
  }

  private findParentBlock(block: LayoutBlock, existingBlocks: LayoutBlock[]): string | null {
    for (const candidate of existingBlocks) {
      if (candidate.id === block.id) continue;
      if (
        candidate.bbox.x <= block.bbox.x &&
        candidate.bbox.y <= block.bbox.y &&
        candidate.bbox.x + candidate.bbox.width >= block.bbox.x + block.bbox.width &&
        candidate.bbox.y + candidate.bbox.height >= block.bbox.y + block.bbox.height
      ) {
        return candidate.id;
      }
    }
    return null;
  }

  private constraintSolving(layout: ReconstructedLayout, config: PipelineConfig): ConstraintSolution {
    logger.debug('Stage 5: Constraint Solving');
    const constraints: SolvedConstraint[] = [];
    const maxIter = config.constraintSolvingMaxIterations;
    let residual = Infinity;
    let iteration = 0;

    const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const node of layout.nodes) {
      positions.set(node.id, { x: node.bbox.x, y: node.bbox.y, w: node.bbox.width, h: node.bbox.height });
    }

    while (iteration < maxIter && residual > 0.01) {
      let totalResidual = 0;
      const sortedNodes = [...layout.nodes].sort((a, b) => a.bbox.y - b.bbox.y);

      for (let i = 0; i < sortedNodes.length; i++) {
        const node = sortedNodes[i];
        const pos = positions.get(node.id)!;

        // Container bounds constraint
        if (pos.x < 0) { totalResidual += Math.abs(pos.x); pos.x = 0; }
        if (pos.y < 0) { totalResidual += Math.abs(pos.y); pos.y = 0; }
        if (pos.x + pos.w > layout.containerWidth) {
          const overflow = pos.x + pos.w - layout.containerWidth;
          totalResidual += overflow;
          pos.x -= overflow;
        }
        if (pos.y + pos.h > layout.containerHeight) {
          const overflow = pos.y + pos.h - layout.containerHeight;
          totalResidual += overflow;
          pos.y -= overflow;
        }

        // Non-overlap with siblings
        for (let j = i + 1; j < sortedNodes.length; j++) {
          const other = sortedNodes[j];
          if (node.children.includes(other.id) || other.children.includes(node.id)) continue;
          const oPos = positions.get(other.id)!;
          const overlapX = Math.max(0, Math.min(pos.x + pos.w, oPos.x + oPos.w) - Math.max(pos.x, oPos.x));
          const overlapY = Math.max(0, Math.min(pos.y + pos.h, oPos.y + oPos.h) - Math.max(pos.y, oPos.y));
          if (overlapX > 0 && overlapY > 0) {
            const pushAmount = Math.min(overlapX, overlapY) / 2;
            totalResidual += pushAmount;
            if (overlapX < overlapY) {
              pos.x -= pushAmount;
              oPos.x += pushAmount;
            } else {
              pos.y -= pushAmount;
              oPos.y += pushAmount;
            }
          }
        }
      }

      residual = totalResidual / Math.max(layout.nodes.length, 1);
      iteration++;
    }

    for (const node of layout.nodes) {
      const pos = positions.get(node.id)!;
      constraints.push(
        { elementId: node.id, property: 'x', value: pos.x, unit: 'px', expression: `${node.id}.x = ${pos.x}px` },
        { elementId: node.id, property: 'y', value: pos.y, unit: 'px', expression: `${node.id}.y = ${pos.y}px` },
        { elementId: node.id, property: 'width', value: pos.w, unit: 'px', expression: `${node.id}.width = ${pos.w}px` },
        { elementId: node.id, property: 'height', value: pos.h, unit: 'px', expression: `${node.id}.height = ${pos.h}px` },
      );
    }

    return { constraints, residual, iterations: iteration, converged: residual <= 0.01 };
  }

  private pixelDiffValidation(imageBuffer: Buffer, layout: ReconstructedLayout, config: PipelineConfig): PixelDiffResult {
    logger.debug('Stage 6: Pixel Diff Validation');
    const totalPixels = config.containerWidth * config.containerHeight;
    const hotspots: Array<{ x: number; y: number; w: number; h: number; severity: number }> = [];

    // Compute coverage of layout blocks vs image area
    let coveredPixels = 0;
    for (const node of layout.nodes) {
      coveredPixels += node.bbox.width * node.bbox.height;
    }
    const coverageRatio = Math.min(1, coveredPixels / totalPixels);

    // Estimate diff based on uncovered areas and confidence
    const avgConfidence = layout.nodes.length > 0
      ? layout.nodes.reduce((s, n) => s + n.confidence, 0) / layout.nodes.length
      : 0;
    const estimatedDiff = (1 - coverageRatio) * (1 - avgConfidence);
    const mismatchedPixels = Math.floor(estimatedDiff * totalPixels);

    // Identify hotspots: areas with low confidence
    for (const node of layout.nodes) {
      if (node.confidence < 0.7) {
        hotspots.push({
          x: node.bbox.x,
          y: node.bbox.y,
          w: node.bbox.width,
          h: node.bbox.height,
          severity: parseFloat((1 - node.confidence).toFixed(4)),
        });
      }
    }

    return {
      diffPercentage: parseFloat(estimatedDiff.toFixed(6)),
      totalPixels,
      mismatchedPixels,
      hotspots,
    };
  }
}
