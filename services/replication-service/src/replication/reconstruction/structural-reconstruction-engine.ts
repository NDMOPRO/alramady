import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SegmentedElement {
  id: string;
  type: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  children?: SegmentedElement[];
  parentId?: string | null;
  style?: Record<string, unknown>;
  content?: Record<string, unknown>;
  zIndex?: number;
  rotation?: number;
  opacity?: number;
  semanticRole?: string;
}

export interface ReconstructedElement {
  id: string;
  type: string;
  semanticRole: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation: number;
  opacity: number;
  borderWidth: number;
  borderRadius: number;
  shadowVector: { offsetX: number; offsetY: number; blur: number; spread: number };
  padding: { top: number; right: number; bottom: number; left: number };
  margin: { top: number; right: number; bottom: number; left: number };
  lineHeight: number;
  letterSpacing: number;
  fontWeight: number;
  fontSizeRatio: number;
  children: ReconstructedElement[];
  parentId: string | null;
  hash: string;
  confidence: number;
  content: Record<string, unknown>;
  style: Record<string, unknown>;
}

export interface ReconstructionConfig {
  containerWidth: number;
  containerHeight: number;
  snapToGrid: boolean;
  gridSize: number;
  resolveOverlaps: boolean;
  minElementSize: number;
  maxDepth: number;
}

const DEFAULT_CONFIG: ReconstructionConfig = {
  containerWidth: 1920,
  containerHeight: 1080,
  snapToGrid: true,
  gridSize: 4,
  resolveOverlaps: true,
  minElementSize: 2,
  maxDepth: 16,
};

// ─── Engine ──────────────────────────────────────────────────────────────────

export class StructuralReconstructionEngine {
  private readonly config: ReconstructionConfig;

  constructor(config?: Partial<ReconstructionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('StructuralReconstructionEngine initialized', {
      containerWidth: this.config.containerWidth,
      containerHeight: this.config.containerHeight,
    });
  }

  reconstructStructure(elements: SegmentedElement[]): ReconstructedElement[] {
    logger.info('Starting structural reconstruction', { elementCount: elements.length });
    const startTime = Date.now();

    const sorted = this.sortByReadingOrder(elements);
    const reconstructed = sorted.map((el) => this.reconstructElement(el, 0));
    const positioned = this.resolveAbsolutePositions(reconstructed);
    const snapped = this.config.snapToGrid ? positioned.map((el) => this.snapElementToGrid(el)) : positioned;
    const resolved = this.config.resolveOverlaps ? this.resolveOverlappingElements(snapped) : snapped;
    const validated = resolved.filter((el) => this.validateElement(el));

    const elapsed = Date.now() - startTime;
    logger.info('Structural reconstruction complete', {
      inputCount: elements.length,
      outputCount: validated.length,
      elapsedMs: elapsed,
    });

    return validated;
  }

  private sortByReadingOrder(elements: SegmentedElement[]): SegmentedElement[] {
    return [...elements].sort((a, b) => {
      const rowA = Math.floor(a.bbox.y / this.config.gridSize);
      const rowB = Math.floor(b.bbox.y / this.config.gridSize);
      if (rowA !== rowB) return rowA - rowB;
      return a.bbox.x - b.bbox.x;
    });
  }

  private reconstructElement(element: SegmentedElement, depth: number): ReconstructedElement {
    if (depth > this.config.maxDepth) {
      logger.warn('Max reconstruction depth reached', { elementId: element.id, depth });
    }

    const style = element.style || {};
    const font = (style.font as Record<string, unknown>) || {};
    const border = (style.border as Record<string, unknown>) || {};
    const shadow = (style.shadow as Record<string, unknown>) || {};
    const padding = (style.padding as Record<string, number>) || {};
    const margin = (style.margin as Record<string, number>) || {};

    const reconstructed: ReconstructedElement = {
      id: element.id,
      type: element.type,
      semanticRole: element.semanticRole || this.inferSemanticRole(element),
      x: this.clampPosition(element.bbox.x, 0, this.config.containerWidth),
      y: this.clampPosition(element.bbox.y, 0, this.config.containerHeight),
      width: Math.max(element.bbox.width, this.config.minElementSize),
      height: Math.max(element.bbox.height, this.config.minElementSize),
      zIndex: element.zIndex ?? this.computeZIndex(element),
      rotation: element.rotation ?? 0,
      opacity: element.opacity ?? (typeof style.opacity === 'number' ? style.opacity : 1),
      borderWidth: typeof border.width === 'number' ? border.width : (typeof style.borderWidth === 'number' ? style.borderWidth : 0),
      borderRadius: typeof border.radius === 'number' ? border.radius : (typeof style.borderRadius === 'number' ? style.borderRadius : 0),
      shadowVector: {
        offsetX: typeof shadow.offsetX === 'number' ? shadow.offsetX : 0,
        offsetY: typeof shadow.offsetY === 'number' ? shadow.offsetY : 0,
        blur: typeof shadow.blur === 'number' ? shadow.blur : 0,
        spread: typeof shadow.spread === 'number' ? shadow.spread : 0,
      },
      padding: {
        top: typeof padding.top === 'number' ? padding.top : 0,
        right: typeof padding.right === 'number' ? padding.right : 0,
        bottom: typeof padding.bottom === 'number' ? padding.bottom : 0,
        left: typeof padding.left === 'number' ? padding.left : 0,
      },
      margin: {
        top: typeof margin.top === 'number' ? margin.top : 0,
        right: typeof margin.right === 'number' ? margin.right : 0,
        bottom: typeof margin.bottom === 'number' ? margin.bottom : 0,
        left: typeof margin.left === 'number' ? margin.left : 0,
      },
      lineHeight: typeof font.lineHeight === 'number' ? font.lineHeight : 1.5,
      letterSpacing: typeof font.letterSpacing === 'number' ? font.letterSpacing : 0,
      fontWeight: typeof font.weight === 'number' ? font.weight : 400,
      fontSizeRatio: this.computeFontSizeRatio(element),
      children: [],
      parentId: element.parentId ?? null,
      hash: '',
      confidence: element.confidence,
      content: element.content || {},
      style: element.style || {},
    };

    if (element.children && element.children.length > 0 && depth < this.config.maxDepth) {
      reconstructed.children = element.children.map((child) => {
        const reconstructedChild = this.reconstructElement(child, depth + 1);
        reconstructedChild.parentId = element.id;
        reconstructedChild.x = this.clampPosition(
          reconstructedChild.x,
          reconstructed.x,
          reconstructed.x + reconstructed.width
        );
        reconstructedChild.y = this.clampPosition(
          reconstructedChild.y,
          reconstructed.y,
          reconstructed.y + reconstructed.height
        );
        return reconstructedChild;
      });
    }

    reconstructed.hash = this.computeElementHash(reconstructed);
    return reconstructed;
  }

  private resolveAbsolutePositions(elements: ReconstructedElement[]): ReconstructedElement[] {
    const parentMap = new Map<string, ReconstructedElement>();
    const flatList = this.flattenElements(elements);
    for (const el of flatList) {
      parentMap.set(el.id, el);
    }

    for (const el of flatList) {
      if (el.parentId && parentMap.has(el.parentId)) {
        const parent = parentMap.get(el.parentId)!;
        if (el.x < parent.x || el.y < parent.y) {
          el.x = parent.x + (el.x - parent.x);
          el.y = parent.y + (el.y - parent.y);
        }
      }
    }

    return elements;
  }

  private flattenElements(elements: ReconstructedElement[]): ReconstructedElement[] {
    const result: ReconstructedElement[] = [];
    const stack = [...elements];
    while (stack.length > 0) {
      const el = stack.pop()!;
      result.push(el);
      for (const child of el.children) {
        stack.push(child);
      }
    }
    return result;
  }

  private snapElementToGrid(element: ReconstructedElement): ReconstructedElement {
    const gs = this.config.gridSize;
    element.x = Math.round(element.x / gs) * gs;
    element.y = Math.round(element.y / gs) * gs;
    element.width = Math.max(Math.round(element.width / gs) * gs, this.config.minElementSize);
    element.height = Math.max(Math.round(element.height / gs) * gs, this.config.minElementSize);
    element.children = element.children.map((c) => this.snapElementToGrid(c));
    element.hash = this.computeElementHash(element);
    return element;
  }

  private resolveOverlappingElements(elements: ReconstructedElement[]): ReconstructedElement[] {
    const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (a.parentId === b.id || b.parentId === a.id) continue;

        const overlap = this.computeOverlap(a, b);
        if (overlap > 0.8) {
          const smallerArea = a.width * a.height < b.width * b.height ? a : b;
          const largerArea = smallerArea === a ? b : a;
          smallerArea.x = largerArea.x + largerArea.width + this.config.gridSize;
          smallerArea.hash = this.computeElementHash(smallerArea);
          logger.debug('Resolved overlap', { elementA: a.id, elementB: b.id, overlap });
        }
      }
    }

    return sorted;
  }

  private computeOverlap(a: ReconstructedElement, b: ReconstructedElement): number {
    const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const overlapArea = overlapX * overlapY;
    const smallerArea = Math.min(a.width * a.height, b.width * b.height);
    return smallerArea > 0 ? overlapArea / smallerArea : 0;
  }

  private validateElement(element: ReconstructedElement): boolean {
    if (element.width < this.config.minElementSize || element.height < this.config.minElementSize) {
      logger.debug('Element too small, filtered', { id: element.id, w: element.width, h: element.height });
      return false;
    }
    if (element.x + element.width < 0 || element.y + element.height < 0) {
      logger.debug('Element fully out of bounds', { id: element.id });
      return false;
    }
    if (element.opacity <= 0) {
      logger.debug('Element fully transparent, filtered', { id: element.id });
      return false;
    }
    return true;
  }

  private inferSemanticRole(element: SegmentedElement): string {
    const type = element.type.toLowerCase();
    const aspectRatio = element.bbox.width / Math.max(element.bbox.height, 1);

    if (type.includes('text') || type.includes('heading') || type.includes('paragraph')) return 'text';
    if (type.includes('image') || type.includes('photo') || type.includes('icon')) return 'image';
    if (type.includes('chart') || type.includes('graph')) return 'chart';
    if (type.includes('table')) return 'table';
    if (type.includes('kpi') || type.includes('metric') || type.includes('card')) return 'kpi';
    if (type.includes('button') || type.includes('cta')) return 'interactive';
    if (type.includes('filter') || type.includes('dropdown')) return 'filter';
    if (type.includes('legend')) return 'legend';
    if (type.includes('nav') || type.includes('sidebar')) return 'navigation';

    if (aspectRatio > 6 && element.bbox.height < 60) return 'separator';
    if (element.bbox.width > this.config.containerWidth * 0.9 && element.bbox.height < 80) return 'header';

    return 'container';
  }

  private computeZIndex(element: SegmentedElement): number {
    const type = element.type.toLowerCase();
    if (type.includes('background') || type.includes('bg')) return 0;
    if (type.includes('overlay') || type.includes('modal')) return 100;
    if (type.includes('tooltip')) return 200;
    return 10 + Math.floor(element.bbox.y / 100);
  }

  private computeFontSizeRatio(element: SegmentedElement): number {
    const style = element.style || {};
    const font = (style.font as Record<string, unknown>) || {};
    const fontSize = typeof font.size === 'number' ? font.size : 16;
    const baseFontSize = 16;
    return parseFloat((fontSize / baseFontSize).toFixed(4));
  }

  private computeElementHash(element: ReconstructedElement): string {
    const hashInput = JSON.stringify({
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      zIndex: element.zIndex,
      rotation: element.rotation,
      opacity: element.opacity,
      borderWidth: element.borderWidth,
      borderRadius: element.borderRadius,
      shadowVector: element.shadowVector,
      padding: element.padding,
      margin: element.margin,
      lineHeight: element.lineHeight,
      letterSpacing: element.letterSpacing,
      fontWeight: element.fontWeight,
      fontSizeRatio: element.fontSizeRatio,
    });
    return crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
  }

  private clampPosition(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
  }
}
