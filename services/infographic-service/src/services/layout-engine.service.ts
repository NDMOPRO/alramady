import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface LayoutElement {
  id: string;
  type: 'text' | 'image' | 'chart' | 'icon' | 'shape' | 'divider' | 'group' | 'stat' | 'timeline_item';
  position: BoundingBox;
  content?: string;
  style: ElementStyle;
  constraints: LayoutConstraints;
  children?: LayoutElement[];
  zIndex: number;
  anchor?: AnchorPoint;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

interface ElementStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  margin?: { top: number; right: number; bottom: number; left: number };
  opacity?: number;
  shadow?: { offsetX: number; offsetY: number; blur: number; color: string };
}

interface LayoutConstraints {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  aspectRatio?: number;
  fixedPosition?: boolean;
  snapToGrid?: boolean;
  gridSize?: number;
}

interface AnchorPoint {
  element?: string;
  side: 'top' | 'bottom' | 'left' | 'right' | 'center';
  offset: { x: number; y: number };
}

type LayoutAlgorithm = 'grid' | 'flow' | 'radial' | 'tree' | 'masonry' | 'force_directed' | 'timeline' | 'dashboard';

interface LayoutConfig {
  algorithm: LayoutAlgorithm;
  canvasWidth: number;
  canvasHeight: number;
  padding: { top: number; right: number; bottom: number; left: number };
  gap: number;
  alignment: 'start' | 'center' | 'end' | 'stretch';
  direction: 'horizontal' | 'vertical';
  columns?: number;
  rows?: number;
  centerX?: number;
  centerY?: number;
  radius?: number;
}

interface LayoutResult {
  elements: LayoutElement[];
  canvasWidth: number;
  canvasHeight: number;
  collisions: CollisionInfo[];
  utilization: number;
  boundingBox: BoundingBox;
}

interface CollisionInfo {
  elementA: string;
  elementB: string;
  overlapArea: number;
  resolution: { dx: number; dy: number };
}

interface ScaleConfig {
  targetWidth: number;
  targetHeight: number;
  mode: 'fit' | 'fill' | 'stretch' | 'none';
  anchor: 'top-left' | 'top-center' | 'center' | 'bottom-center';
  minScale: number;
  maxScale: number;
}

interface TreeLayoutNode {
  elementId: string;
  parentId?: string;
  children: string[];
  depth: number;
  siblingIndex: number;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class LayoutEngineService {
  private prisma: PrismaClient;
  private layoutCache: Map<string, LayoutResult> = new Map();
  private readonly GRID_SNAP_SIZE = 10;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async computeLayout(
    infographicId: string,
    elements: LayoutElement[],
    config: LayoutConfig,
  ): Promise<LayoutResult> {
    let positionedElements: LayoutElement[];

    switch (config.algorithm) {
      case 'grid':
        positionedElements = this.computeGridLayout(elements, config);
        break;
      case 'flow':
        positionedElements = this.computeFlowLayout(elements, config);
        break;
      case 'radial':
        positionedElements = this.computeRadialLayout(elements, config);
        break;
      case 'tree':
        positionedElements = this.computeTreeLayout(elements, config);
        break;
      case 'masonry':
        positionedElements = this.computeMasonryLayout(elements, config);
        break;
      case 'force_directed':
        positionedElements = this.computeForceDirectedLayout(elements, config);
        break;
      case 'timeline':
        positionedElements = this.computeTimelineLayout(elements, config);
        break;
      case 'dashboard':
        positionedElements = this.computeDashboardLayout(elements, config);
        break;
      default:
        positionedElements = elements;
    }

    const collisions = this.detectCollisions(positionedElements);
    if (collisions.length > 0) {
      positionedElements = this.resolveCollisions(positionedElements, collisions, config);
    }

    if (elements.some(e => e.constraints.snapToGrid)) {
      positionedElements = this.snapToGrid(positionedElements, config);
    }

    const boundingBox = this.computeBoundingBox(positionedElements);
    const totalArea = config.canvasWidth * config.canvasHeight;
    const usedArea = positionedElements.reduce(
      (sum, el) => sum + el.position.width * el.position.height, 0,
    );
    const utilization = totalArea > 0 ? Math.round((usedArea / totalArea) * 10000) / 100 : 0;

    const result: LayoutResult = {
      elements: positionedElements,
      canvasWidth: config.canvasWidth,
      canvasHeight: config.canvasHeight,
      collisions: this.detectCollisions(positionedElements),
      utilization,
      boundingBox,
    };

    this.layoutCache.set(infographicId, result);

    await (this.prisma as unknown as Record<string, { upsert(args: Record<string, unknown>): Promise<unknown> }>).infographicLayout.upsert({
      where: { infographicId },
      update: {
        algorithm: config.algorithm,
        elements: JSON.parse(JSON.stringify(positionedElements)),
        config: JSON.parse(JSON.stringify(config)),
        utilization,
        updatedAt: new Date(),
      },
      create: {
        id: crypto.randomUUID(),
        infographicId,
        algorithm: config.algorithm,
        elements: JSON.parse(JSON.stringify(positionedElements)),
        config: JSON.parse(JSON.stringify(config)),
        utilization,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return result;
  }

  private computeGridLayout(elements: LayoutElement[], config: LayoutConfig): LayoutElement[] {
    const cols = config.columns || Math.ceil(Math.sqrt(elements.length));
    const rows = Math.ceil(elements.length / cols);
    const availableWidth = config.canvasWidth - config.padding.left - config.padding.right;
    const availableHeight = config.canvasHeight - config.padding.top - config.padding.bottom;
    const cellWidth = (availableWidth - config.gap * (cols - 1)) / cols;
    const cellHeight = (availableHeight - config.gap * (rows - 1)) / rows;

    return elements.map((el, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      let elWidth = Math.min(cellWidth, el.constraints.maxWidth || cellWidth);
      let elHeight = Math.min(cellHeight, el.constraints.maxHeight || cellHeight);

      if (el.constraints.aspectRatio) {
        const ratioWidth = elHeight * el.constraints.aspectRatio;
        const ratioHeight = elWidth / el.constraints.aspectRatio;
        if (ratioWidth <= cellWidth) {
          elWidth = ratioWidth;
        } else {
          elHeight = ratioHeight;
        }
      }

      elWidth = Math.max(elWidth, el.constraints.minWidth || 0);
      elHeight = Math.max(elHeight, el.constraints.minHeight || 0);

      let x = config.padding.left + col * (cellWidth + config.gap);
      let y = config.padding.top + row * (cellHeight + config.gap);

      if (config.alignment === 'center') {
        x += (cellWidth - elWidth) / 2;
        y += (cellHeight - elHeight) / 2;
      } else if (config.alignment === 'end') {
        x += cellWidth - elWidth;
        y += cellHeight - elHeight;
      }

      return {
        ...el,
        position: { ...el.position, x, y, width: elWidth, height: elHeight },
      };
    });
  }

  private computeFlowLayout(elements: LayoutElement[], config: LayoutConfig): LayoutElement[] {
    const isHorizontal = config.direction === 'horizontal';
    const availableWidth = config.canvasWidth - config.padding.left - config.padding.right;
    const availableHeight = config.canvasHeight - config.padding.top - config.padding.bottom;

    const result: LayoutElement[] = [];
    let currentX = config.padding.left;
    let currentY = config.padding.top;
    let lineHeight = 0;
    let lineWidth = 0;

    for (const el of elements) {
      let elWidth = el.position.width || 100;
      let elHeight = el.position.height || 100;

      elWidth = Math.max(el.constraints.minWidth || 0, Math.min(elWidth, el.constraints.maxWidth || availableWidth));
      elHeight = Math.max(el.constraints.minHeight || 0, Math.min(elHeight, el.constraints.maxHeight || availableHeight));

      if (isHorizontal) {
        if (currentX + elWidth > config.canvasWidth - config.padding.right && currentX > config.padding.left) {
          currentX = config.padding.left;
          currentY += lineHeight + config.gap;
          lineHeight = 0;
        }

        result.push({
          ...el,
          position: { ...el.position, x: currentX, y: currentY, width: elWidth, height: elHeight },
        });

        currentX += elWidth + config.gap;
        lineHeight = Math.max(lineHeight, elHeight);
      } else {
        if (currentY + elHeight > config.canvasHeight - config.padding.bottom && currentY > config.padding.top) {
          currentY = config.padding.top;
          currentX += lineWidth + config.gap;
          lineWidth = 0;
        }

        result.push({
          ...el,
          position: { ...el.position, x: currentX, y: currentY, width: elWidth, height: elHeight },
        });

        currentY += elHeight + config.gap;
        lineWidth = Math.max(lineWidth, elWidth);
      }
    }

    return result;
  }

  private computeRadialLayout(elements: LayoutElement[], config: LayoutConfig): LayoutElement[] {
    const centerX = config.centerX || config.canvasWidth / 2;
    const centerY = config.centerY || config.canvasHeight / 2;
    const radius = config.radius || Math.min(config.canvasWidth, config.canvasHeight) * 0.35;
    const angleStep = (2 * Math.PI) / elements.length;
    const startAngle = -Math.PI / 2;

    return elements.map((el, index) => {
      const angle = startAngle + index * angleStep;
      const elWidth = el.position.width || 80;
      const elHeight = el.position.height || 80;

      const x = centerX + radius * Math.cos(angle) - elWidth / 2;
      const y = centerY + radius * Math.sin(angle) - elHeight / 2;

      const rotation = el.position.rotation !== undefined
        ? el.position.rotation
        : undefined;

      return {
        ...el,
        position: { ...el.position, x, y, width: elWidth, height: elHeight, rotation },
      };
    });
  }

  private computeTreeLayout(elements: LayoutElement[], config: LayoutConfig): LayoutElement[] {
    if (elements.length === 0) return [];

    const nodes: TreeLayoutNode[] = elements.map((el, index) => ({
      elementId: el.id,
      parentId: index === 0 ? undefined : elements[Math.floor((index - 1) / 2)]?.id,
      children: [],
      depth: 0,
      siblingIndex: 0,
    }));

    for (const node of nodes) {
      if (node.parentId) {
        const parent = nodes.find(n => n.elementId === node.parentId);
        if (parent) {
          parent.children.push(node.elementId);
        }
      }
    }

    const assignDepths = (nodeId: string, depth: number, siblingIndex: number): void => {
      const node = nodes.find(n => n.elementId === nodeId);
      if (!node) return;
      node.depth = depth;
      node.siblingIndex = siblingIndex;
      node.children.forEach((childId, idx) => assignDepths(childId, depth + 1, idx));
    };

    assignDepths(nodes[0].elementId, 0, 0);

    const maxDepth = Math.max(...nodes.map(n => n.depth));
    const isVertical = config.direction === 'vertical';
    const availableWidth = config.canvasWidth - config.padding.left - config.padding.right;
    const availableHeight = config.canvasHeight - config.padding.top - config.padding.bottom;

    const levelHeight = isVertical
      ? availableHeight / (maxDepth + 1)
      : availableWidth / (maxDepth + 1);

    const nodesPerLevel = new Map<number, number>();
    for (const node of nodes) {
      nodesPerLevel.set(node.depth, (nodesPerLevel.get(node.depth) || 0) + 1);
    }

    const levelCounters = new Map<number, number>();

    return elements.map((el, index) => {
      const node = nodes[index];
      const levelTotal = nodesPerLevel.get(node.depth) || 1;
      const currentIndex = levelCounters.get(node.depth) || 0;
      levelCounters.set(node.depth, currentIndex + 1);

      const elWidth = el.position.width || 100;
      const elHeight = el.position.height || 60;

      let x: number;
      let y: number;

      if (isVertical) {
        const levelWidth = availableWidth / levelTotal;
        x = config.padding.left + currentIndex * levelWidth + (levelWidth - elWidth) / 2;
        y = config.padding.top + node.depth * levelHeight + (levelHeight - elHeight) / 2;
      } else {
        const levelSpan = availableHeight / levelTotal;
        x = config.padding.left + node.depth * levelHeight + (levelHeight - elWidth) / 2;
        y = config.padding.top + currentIndex * levelSpan + (levelSpan - elHeight) / 2;
      }

      return {
        ...el,
        position: { ...el.position, x, y, width: elWidth, height: elHeight },
      };
    });
  }

  private computeMasonryLayout(elements: LayoutElement[], config: LayoutConfig): LayoutElement[] {
    const cols = config.columns || 3;
    const availableWidth = config.canvasWidth - config.padding.left - config.padding.right;
    const colWidth = (availableWidth - config.gap * (cols - 1)) / cols;
    const colHeights = new Array(cols).fill(config.padding.top);

    return elements.map(el => {
      const shortestCol = colHeights.indexOf(Math.min(...colHeights));
      const elWidth = colWidth;
      const elHeight = el.position.height || el.constraints.aspectRatio
        ? colWidth / (el.constraints.aspectRatio || 1)
        : 150;

      const x = config.padding.left + shortestCol * (colWidth + config.gap);
      const y = colHeights[shortestCol];

      colHeights[shortestCol] += elHeight + config.gap;

      return {
        ...el,
        position: { ...el.position, x, y, width: elWidth, height: elHeight },
      };
    });
  }

  private computeForceDirectedLayout(elements: LayoutElement[], config: LayoutConfig): LayoutElement[] {
    const positions = elements.map((el, i) => ({
      id: el.id,
      x: config.canvasWidth / 2 + (((i * 137.508) % 360) / 360 - 0.5) * config.canvasWidth * 0.5,
      y: config.canvasHeight / 2 + (((i * 222.492) % 360) / 360 - 0.5) * config.canvasHeight * 0.5,
      vx: 0,
      vy: 0,
      width: el.position.width || 100,
      height: el.position.height || 80,
    }));

    const iterations = 100;
    const repulsionStrength = 5000;
    const attractionStrength = 0.01;
    const damping = 0.85;
    const centerGravity = 0.005;

    for (let iter = 0; iter < iterations; iter++) {
      const temperature = 1 - iter / iterations;

      for (let i = 0; i < positions.length; i++) {
        let fx = 0;
        let fy = 0;

        for (let j = 0; j < positions.length; j++) {
          if (i === j) continue;
          const dx = positions[i].x - positions[j].x;
          const dy = positions[i].y - positions[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = (positions[i].width + positions[j].width) / 2 + config.gap;

          if (dist < minDist * 3) {
            const force = repulsionStrength / (dist * dist);
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          }
        }

        const dxCenter = config.canvasWidth / 2 - positions[i].x;
        const dyCenter = config.canvasHeight / 2 - positions[i].y;
        fx += dxCenter * centerGravity;
        fy += dyCenter * centerGravity;

        positions[i].vx = (positions[i].vx + fx) * damping * temperature;
        positions[i].vy = (positions[i].vy + fy) * damping * temperature;
      }

      for (const pos of positions) {
        pos.x += pos.vx;
        pos.y += pos.vy;
        pos.x = Math.max(config.padding.left + pos.width / 2,
          Math.min(config.canvasWidth - config.padding.right - pos.width / 2, pos.x));
        pos.y = Math.max(config.padding.top + pos.height / 2,
          Math.min(config.canvasHeight - config.padding.bottom - pos.height / 2, pos.y));
      }
    }

    return elements.map((el, i) => ({
      ...el,
      position: {
        ...el.position,
        x: positions[i].x - positions[i].width / 2,
        y: positions[i].y - positions[i].height / 2,
        width: positions[i].width,
        height: positions[i].height,
      },
    }));
  }

  private computeTimelineLayout(elements: LayoutElement[], config: LayoutConfig): LayoutElement[] {
    const isHorizontal = config.direction === 'horizontal';
    const availableLength = isHorizontal
      ? config.canvasWidth - config.padding.left - config.padding.right
      : config.canvasHeight - config.padding.top - config.padding.bottom;

    const spacing = elements.length > 1
      ? (availableLength - 100) / (elements.length - 1)
      : 0;

    const midX = config.canvasWidth / 2;
    const midY = config.canvasHeight / 2;

    return elements.map((el, index) => {
      const elWidth = el.position.width || 200;
      const elHeight = el.position.height || 100;
      const alternating = index % 2 === 0;

      let x: number;
      let y: number;

      if (isHorizontal) {
        x = config.padding.left + index * spacing;
        y = alternating
          ? midY - elHeight - config.gap
          : midY + config.gap;
      } else {
        x = alternating
          ? midX - elWidth - config.gap
          : midX + config.gap;
        y = config.padding.top + index * spacing;
      }

      return {
        ...el,
        position: { ...el.position, x, y, width: elWidth, height: elHeight },
      };
    });
  }

  private computeDashboardLayout(elements: LayoutElement[], config: LayoutConfig): LayoutElement[] {
    const cols = config.columns || 4;
    const availableWidth = config.canvasWidth - config.padding.left - config.padding.right;
    const cellSize = (availableWidth - config.gap * (cols - 1)) / cols;
    const grid: boolean[][] = [];
    const maxRows = 100;

    for (let r = 0; r < maxRows; r++) {
      grid.push(new Array(cols).fill(false));
    }

    return elements.map(el => {
      const spanW = Math.ceil((el.position.width || cellSize) / (cellSize + config.gap));
      const spanH = Math.ceil((el.position.height || cellSize) / (cellSize + config.gap));
      const colSpan = Math.min(spanW, cols);
      const rowSpan = Math.max(1, spanH);

      let placedCol = 0;
      let placedRow = 0;
      let placed = false;

      for (let r = 0; r < maxRows && !placed; r++) {
        for (let c = 0; c <= cols - colSpan && !placed; c++) {
          let fits = true;
          for (let dr = 0; dr < rowSpan && fits; dr++) {
            for (let dc = 0; dc < colSpan && fits; dc++) {
              if (r + dr >= maxRows || grid[r + dr][c + dc]) {
                fits = false;
              }
            }
          }

          if (fits) {
            placedCol = c;
            placedRow = r;
            placed = true;

            for (let dr = 0; dr < rowSpan; dr++) {
              for (let dc = 0; dc < colSpan; dc++) {
                grid[r + dr][c + dc] = true;
              }
            }
          }
        }
      }

      const x = config.padding.left + placedCol * (cellSize + config.gap);
      const y = config.padding.top + placedRow * (cellSize + config.gap);
      const width = colSpan * cellSize + (colSpan - 1) * config.gap;
      const height = rowSpan * cellSize + (rowSpan - 1) * config.gap;

      return {
        ...el,
        position: { ...el.position, x, y, width, height },
      };
    });
  }

  detectCollisions(elements: LayoutElement[]): CollisionInfo[] {
    const collisions: CollisionInfo[] = [];

    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i].position;
        const b = elements[j].position;

        const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        const overlapArea = overlapX * overlapY;

        if (overlapArea > 0) {
          const dx = overlapX < overlapY ? (a.x < b.x ? -overlapX : overlapX) : 0;
          const dy = overlapX >= overlapY ? (a.y < b.y ? -overlapY : overlapY) : 0;

          collisions.push({
            elementA: elements[i].id,
            elementB: elements[j].id,
            overlapArea,
            resolution: { dx, dy },
          });
        }
      }
    }

    return collisions;
  }

  private resolveCollisions(
    elements: LayoutElement[],
    collisions: CollisionInfo[],
    config: LayoutConfig,
  ): LayoutElement[] {
    const adjusted = elements.map(el => ({ ...el, position: { ...el.position } }));

    for (const collision of collisions) {
      const idxA = adjusted.findIndex(e => e.id === collision.elementA);
      const idxB = adjusted.findIndex(e => e.id === collision.elementB);
      if (idxA < 0 || idxB < 0) continue;

      const elA = adjusted[idxA];
      const elB = adjusted[idxB];

      if (elA.constraints.fixedPosition && !elB.constraints.fixedPosition) {
        elB.position.x -= collision.resolution.dx + config.gap;
        elB.position.y -= collision.resolution.dy + config.gap;
      } else if (!elA.constraints.fixedPosition && elB.constraints.fixedPosition) {
        elA.position.x += collision.resolution.dx + config.gap;
        elA.position.y += collision.resolution.dy + config.gap;
      } else {
        elA.position.x += collision.resolution.dx / 2 + config.gap / 2;
        elA.position.y += collision.resolution.dy / 2 + config.gap / 2;
        elB.position.x -= collision.resolution.dx / 2 + config.gap / 2;
        elB.position.y -= collision.resolution.dy / 2 + config.gap / 2;
      }

      elA.position.x = Math.max(config.padding.left, elA.position.x);
      elA.position.y = Math.max(config.padding.top, elA.position.y);
      elB.position.x = Math.max(config.padding.left, elB.position.x);
      elB.position.y = Math.max(config.padding.top, elB.position.y);
    }

    return adjusted;
  }

  private snapToGrid(elements: LayoutElement[], config: LayoutConfig): LayoutElement[] {
    const gridSize = config.gap || this.GRID_SNAP_SIZE;
    return elements.map(el => {
      if (!el.constraints.snapToGrid) return el;
      const snapSize = el.constraints.gridSize || gridSize;
      return {
        ...el,
        position: {
          ...el.position,
          x: Math.round(el.position.x / snapSize) * snapSize,
          y: Math.round(el.position.y / snapSize) * snapSize,
          width: Math.round(el.position.width / snapSize) * snapSize,
          height: Math.round(el.position.height / snapSize) * snapSize,
        },
      };
    });
  }

  private computeBoundingBox(elements: LayoutElement[]): BoundingBox {
    if (elements.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of elements) {
      minX = Math.min(minX, el.position.x);
      minY = Math.min(minY, el.position.y);
      maxX = Math.max(maxX, el.position.x + el.position.width);
      maxY = Math.max(maxY, el.position.y + el.position.height);
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  scaleLayout(elements: LayoutElement[], scaleConfig: ScaleConfig): LayoutElement[] {
    const boundingBox = this.computeBoundingBox(elements);
    if (boundingBox.width === 0 || boundingBox.height === 0) return elements;

    let scaleX = scaleConfig.targetWidth / boundingBox.width;
    let scaleY = scaleConfig.targetHeight / boundingBox.height;

    switch (scaleConfig.mode) {
      case 'fit':
        scaleX = scaleY = Math.min(scaleX, scaleY);
        break;
      case 'fill':
        scaleX = scaleY = Math.max(scaleX, scaleY);
        break;
      case 'none':
        scaleX = scaleY = 1;
        break;
    }

    scaleX = Math.max(scaleConfig.minScale, Math.min(scaleConfig.maxScale, scaleX));
    scaleY = Math.max(scaleConfig.minScale, Math.min(scaleConfig.maxScale, scaleY));

    let offsetX = 0;
    let offsetY = 0;

    if (scaleConfig.anchor === 'center' || scaleConfig.anchor === 'top-center' || scaleConfig.anchor === 'bottom-center') {
      offsetX = (scaleConfig.targetWidth - boundingBox.width * scaleX) / 2;
    }
    if (scaleConfig.anchor === 'center') {
      offsetY = (scaleConfig.targetHeight - boundingBox.height * scaleY) / 2;
    } else if (scaleConfig.anchor === 'bottom-center') {
      offsetY = scaleConfig.targetHeight - boundingBox.height * scaleY;
    }

    return elements.map(el => ({
      ...el,
      position: {
        ...el.position,
        x: (el.position.x - boundingBox.x) * scaleX + offsetX,
        y: (el.position.y - boundingBox.y) * scaleY + offsetY,
        width: el.position.width * scaleX,
        height: el.position.height * scaleY,
      },
    }));
  }
}
