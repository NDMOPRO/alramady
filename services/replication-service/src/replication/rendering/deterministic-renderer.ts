import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CDRNode {
  id: string;
  type: string;
  bbox: { x: number; y: number; width: number; height: number };
  zIndex: number;
  style: Record<string, unknown>;
  content: Record<string, unknown>;
  children: CDRNode[];
}

export interface CDR {
  id: string;
  version: string;
  width: number;
  height: number;
  pages: CDRPage[];
  designTokens: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface CDRPage {
  pageNumber: number;
  width: number;
  height: number;
  backgroundColor: string;
  nodes: CDRNode[];
}

export interface RenderResult {
  cdrId: string;
  layoutFingerprintHash: string;
  pixelHash: string;
  typographyHash: string;
  constraintHash: string;
  renderedPages: RenderedPage[];
  totalNodes: number;
  elapsedMs: number;
}

export interface RenderedPage {
  pageNumber: number;
  layoutFingerprintHash: string;
  pixelHash: string;
  typographyHash: string;
  constraintHash: string;
  nodeCount: number;
}

export interface OriginalFingerprint {
  layoutFingerprintHash: string;
  pixelHash: string;
  typographyHash: string;
  constraintHash: string;
}

export interface MatchResult {
  overallScore: number;
  layoutMatch: number;
  pixelMatch: number;
  typographyMatch: number;
  constraintMatch: number;
  isExactMatch: boolean;
}

export interface RendererConfig {
  hashAlgorithm: string;
  sortNodesBeforeHash: boolean;
  includeHiddenNodes: boolean;
  precisionDigits: number;
}

const DEFAULT_CONFIG: RendererConfig = {
  hashAlgorithm: 'sha256',
  sortNodesBeforeHash: true,
  includeHiddenNodes: false,
  precisionDigits: 4,
};

// ─── Renderer ────────────────────────────────────────────────────────────────

export class DeterministicRenderer {
  private readonly config: RendererConfig;

  constructor(config?: Partial<RendererConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('DeterministicRenderer initialized', {
      hashAlgorithm: this.config.hashAlgorithm,
      sortNodesBeforeHash: this.config.sortNodesBeforeHash,
    });
  }

  render(cdr: CDR): RenderResult {
    logger.info('Rendering CDR deterministically', { cdrId: cdr.id, pageCount: cdr.pages.length });
    const startTime = Date.now();

    const renderedPages: RenderedPage[] = [];
    let totalNodes = 0;

    const allLayoutData: string[] = [];
    const allPixelData: string[] = [];
    const allTypographyData: string[] = [];
    const allConstraintData: string[] = [];

    for (const page of cdr.pages) {
      const nodes = this.collectNodes(page.nodes);
      totalNodes += nodes.length;

      const sortedNodes = this.config.sortNodesBeforeHash
        ? this.sortNodesDeterministically(nodes)
        : nodes;

      const filteredNodes = this.config.includeHiddenNodes
        ? sortedNodes
        : sortedNodes.filter((n) => this.isVisible(n));

      const layoutData = this.extractLayoutData(filteredNodes, page);
      const pixelData = this.extractPixelData(filteredNodes, page);
      const typographyData = this.extractTypographyData(filteredNodes);
      const constraintData = this.extractConstraintData(filteredNodes, page);

      const pageLayoutHash = this.hash(layoutData);
      const pagePixelHash = this.hash(pixelData);
      const pageTypographyHash = this.hash(typographyData);
      const pageConstraintHash = this.hash(constraintData);

      allLayoutData.push(layoutData);
      allPixelData.push(pixelData);
      allTypographyData.push(typographyData);
      allConstraintData.push(constraintData);

      renderedPages.push({
        pageNumber: page.pageNumber,
        layoutFingerprintHash: pageLayoutHash,
        pixelHash: pagePixelHash,
        typographyHash: pageTypographyHash,
        constraintHash: pageConstraintHash,
        nodeCount: filteredNodes.length,
      });
    }

    const result: RenderResult = {
      cdrId: cdr.id,
      layoutFingerprintHash: this.hash(allLayoutData.join('|PAGE|')),
      pixelHash: this.hash(allPixelData.join('|PAGE|')),
      typographyHash: this.hash(allTypographyData.join('|PAGE|')),
      constraintHash: this.hash(allConstraintData.join('|PAGE|')),
      renderedPages,
      totalNodes,
      elapsedMs: Date.now() - startTime,
    };

    logger.info('Deterministic render complete', {
      cdrId: cdr.id,
      totalNodes,
      pageCount: renderedPages.length,
      elapsedMs: result.elapsedMs,
    });

    return result;
  }

  compareToOriginal(result: RenderResult, originalFingerprint: OriginalFingerprint): MatchResult {
    logger.info('Comparing render result to original fingerprint', { cdrId: result.cdrId });

    const layoutMatch = this.computeHashMatch(result.layoutFingerprintHash, originalFingerprint.layoutFingerprintHash);
    const pixelMatch = this.computeHashMatch(result.pixelHash, originalFingerprint.pixelHash);
    const typographyMatch = this.computeHashMatch(result.typographyHash, originalFingerprint.typographyHash);
    const constraintMatch = this.computeHashMatch(result.constraintHash, originalFingerprint.constraintHash);

    const weights = { layout: 0.35, pixel: 0.30, typography: 0.20, constraint: 0.15 };
    const overallScore = parseFloat((
      layoutMatch * weights.layout +
      pixelMatch * weights.pixel +
      typographyMatch * weights.typography +
      constraintMatch * weights.constraint
    ).toFixed(6));

    const isExactMatch =
      result.layoutFingerprintHash === originalFingerprint.layoutFingerprintHash &&
      result.pixelHash === originalFingerprint.pixelHash &&
      result.typographyHash === originalFingerprint.typographyHash &&
      result.constraintHash === originalFingerprint.constraintHash;

    const matchResult: MatchResult = {
      overallScore,
      layoutMatch,
      pixelMatch,
      typographyMatch,
      constraintMatch,
      isExactMatch,
    };

    logger.info('Comparison result', {
      overallScore,
      isExactMatch,
      layoutMatch,
      pixelMatch,
      typographyMatch,
      constraintMatch,
    });

    return matchResult;
  }

  private collectNodes(nodes: CDRNode[]): CDRNode[] {
    const result: CDRNode[] = [];
    const stack = [...nodes];
    while (stack.length > 0) {
      const node = stack.pop()!;
      result.push(node);
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
    return result;
  }

  private sortNodesDeterministically(nodes: CDRNode[]): CDRNode[] {
    return [...nodes].sort((a, b) => {
      if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
      if (a.bbox.y !== b.bbox.y) return a.bbox.y - b.bbox.y;
      if (a.bbox.x !== b.bbox.x) return a.bbox.x - b.bbox.x;
      return a.id.localeCompare(b.id);
    });
  }

  private isVisible(node: CDRNode): boolean {
    const opacity = typeof node.style.opacity === 'number' ? node.style.opacity : 1;
    if (opacity <= 0) return false;
    if (node.bbox.width <= 0 || node.bbox.height <= 0) return false;
    const display = node.style.display;
    if (display === 'none') return false;
    return true;
  }

  private extractLayoutData(nodes: CDRNode[], page: CDRPage): string {
    const p = this.config.precisionDigits;
    const parts: string[] = [
      `page:${page.pageNumber}:${page.width}x${page.height}:${page.backgroundColor}`,
    ];

    for (const node of nodes) {
      parts.push(
        `L:${node.id}:` +
        `${this.round(node.bbox.x, p)},${this.round(node.bbox.y, p)},` +
        `${this.round(node.bbox.width, p)},${this.round(node.bbox.height, p)}:` +
        `z${node.zIndex}:${node.type}`
      );
    }

    return parts.join('\n');
  }

  private extractPixelData(nodes: CDRNode[], page: CDRPage): string {
    const p = this.config.precisionDigits;
    const parts: string[] = [
      `page:${page.pageNumber}:bg=${page.backgroundColor}`,
    ];

    for (const node of nodes) {
      const bg = this.normalizeColor(node.style.backgroundColor);
      const border = this.normalizeBorder(node.style.border);
      const shadow = this.normalizeShadow(node.style.shadow);
      const opacity = typeof node.style.opacity === 'number' ? this.round(node.style.opacity, p) : '1';
      const borderRadius = typeof node.style.borderRadius === 'number' ? this.round(node.style.borderRadius, p) : '0';

      parts.push(
        `P:${node.id}:bg=${bg}:border=${border}:shadow=${shadow}:` +
        `opacity=${opacity}:radius=${borderRadius}:` +
        `area=${this.round(node.bbox.width * node.bbox.height, 0)}`
      );
    }

    return parts.join('\n');
  }

  private extractTypographyData(nodes: CDRNode[]): string {
    const p = this.config.precisionDigits;
    const parts: string[] = [];

    for (const node of nodes) {
      const font = node.style.font as Record<string, unknown> | undefined;
      if (!font && node.type !== 'text') continue;

      const family = font?.family ?? 'default';
      const size = typeof font?.size === 'number' ? this.round(font.size, p) : '16';
      const weight = typeof font?.weight === 'number' ? String(font.weight) : '400';
      const lineHeight = typeof font?.lineHeight === 'number' ? this.round(font.lineHeight, p) : '1.5';
      const letterSpacing = typeof font?.letterSpacing === 'number' ? this.round(font.letterSpacing, p) : '0';
      const fontStyle = typeof font?.style === 'string' ? font.style : 'normal';
      const color = typeof font?.color === 'string' ? font.color : (typeof node.style.color === 'string' ? node.style.color : '#000000');
      const textContent = typeof node.content.text === 'string' ? node.content.text : '';
      const textLength = textContent.length;

      parts.push(
        `T:${node.id}:family=${family}:size=${size}:weight=${weight}:` +
        `lh=${lineHeight}:ls=${letterSpacing}:style=${fontStyle}:` +
        `color=${color}:len=${textLength}`
      );
    }

    return parts.join('\n');
  }

  private extractConstraintData(nodes: CDRNode[], page: CDRPage): string {
    const p = this.config.precisionDigits;
    const parts: string[] = [
      `container:${page.width}x${page.height}`,
    ];

    for (const node of nodes) {
      // Position relative to container
      const relX = this.round(node.bbox.x / page.width, p);
      const relY = this.round(node.bbox.y / page.height, p);
      const relW = this.round(node.bbox.width / page.width, p);
      const relH = this.round(node.bbox.height / page.height, p);

      // Spacing from edges
      const rightGap = this.round(page.width - (node.bbox.x + node.bbox.width), p);
      const bottomGap = this.round(page.height - (node.bbox.y + node.bbox.height), p);

      // Padding and margin
      const padding = this.normalizeSpacing(node.style.padding);
      const margin = this.normalizeSpacing(node.style.margin);

      parts.push(
        `C:${node.id}:rel=${relX},${relY},${relW},${relH}:` +
        `gaps=${this.round(node.bbox.x, p)},${this.round(node.bbox.y, p)},${rightGap},${bottomGap}:` +
        `pad=${padding}:mar=${margin}`
      );
    }

    // Inter-element constraints
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const hGap = this.round(b.bbox.x - (a.bbox.x + a.bbox.width), p);
        const vGap = this.round(b.bbox.y - (a.bbox.y + a.bbox.height), p);

        if (Math.abs(parseFloat(hGap)) < page.width * 0.5 || Math.abs(parseFloat(vGap)) < page.height * 0.5) {
          parts.push(`R:${a.id}-${b.id}:hgap=${hGap}:vgap=${vGap}`);
        }
      }
    }

    return parts.join('\n');
  }

  private hash(data: string): string {
    return crypto.createHash(this.config.hashAlgorithm).update(data, 'utf8').digest('hex');
  }

  private computeHashMatch(hash1: string, hash2: string): number {
    if (hash1 === hash2) return 1.0;

    const bytes1 = Buffer.from(hash1, 'hex');
    const bytes2 = Buffer.from(hash2, 'hex');
    const minLen = Math.min(bytes1.length, bytes2.length);

    if (minLen === 0) return 0;

    let matchingBits = 0;
    let totalBits = 0;

    for (let i = 0; i < minLen; i++) {
      const xor = bytes1[i] ^ bytes2[i];
      for (let bit = 0; bit < 8; bit++) {
        totalBits++;
        if (((xor >> bit) & 1) === 0) matchingBits++;
      }
    }

    return parseFloat((matchingBits / totalBits).toFixed(6));
  }

  private round(value: number, digits: number): string {
    if (digits === 0) return String(Math.round(value));
    return value.toFixed(digits);
  }

  private normalizeColor(color: unknown): string {
    if (typeof color === 'string') {
      return color.toLowerCase().replace(/\s+/g, '');
    }
    return 'transparent';
  }

  private normalizeBorder(border: unknown): string {
    if (border && typeof border === 'object') {
      const b = border as Record<string, unknown>;
      const width = typeof b.width === 'number' ? b.width : 0;
      const style = typeof b.style === 'string' ? b.style : 'none';
      const color = typeof b.color === 'string' ? b.color.toLowerCase() : 'transparent';
      const radius = typeof b.radius === 'number' ? b.radius : 0;
      return `${width}|${style}|${color}|${radius}`;
    }
    return '0|none|transparent|0';
  }

  private normalizeShadow(shadow: unknown): string {
    if (shadow && typeof shadow === 'object') {
      const s = shadow as Record<string, unknown>;
      const ox = typeof s.offsetX === 'number' ? s.offsetX : 0;
      const oy = typeof s.offsetY === 'number' ? s.offsetY : 0;
      const blur = typeof s.blur === 'number' ? s.blur : 0;
      const spread = typeof s.spread === 'number' ? s.spread : 0;
      const color = typeof s.color === 'string' ? s.color.toLowerCase() : 'transparent';
      return `${ox},${oy},${blur},${spread},${color}`;
    }
    return '0,0,0,0,transparent';
  }

  private normalizeSpacing(spacing: unknown): string {
    if (spacing && typeof spacing === 'object') {
      const s = spacing as Record<string, unknown>;
      const top = typeof s.top === 'number' ? s.top : 0;
      const right = typeof s.right === 'number' ? s.right : 0;
      const bottom = typeof s.bottom === 'number' ? s.bottom : 0;
      const left = typeof s.left === 'number' ? s.left : 0;
      return `${top},${right},${bottom},${left}`;
    }
    return '0,0,0,0';
  }
}
