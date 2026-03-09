import type {
  CanonicalLayoutGraph,
  LayoutNode,
  PageNode,
  TextContent,
  FontToken,
} from '@rasid/shared';
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'arabic-typography-optimizer' },
  transports: [new transports.Console()],
});

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface OverflowResult {
  overflows: boolean;
  textWidth: number;
  containerWidth: number;
  suggestedFontSize: number | null;
  suggestedScale: number;
}

export interface TypographyReport {
  totalTextNodes: number;
  arabicTextNodes: number;
  adjustmentsMade: TypographyAdjustment[];
  fontSubstitutions: Array<{ original: string; substituted: string; nodeId: string }>;
  overflowsDetected: number;
  overflowsResolved: number;
  kashidaInsertions: number;
}

export interface TypographyAdjustment {
  nodeId: string;
  type:
    | 'line-height'
    | 'letter-spacing'
    | 'padding'
    | 'font-size'
    | 'font-substitution'
    | 'kashida';
  before: string;
  after: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const KASHIDA = '\u0640';

/** Arabic connecting letters after which Kashida can be inserted. */
const KASHIDA_CONNECTORS = new Set<string>(
  '\u0628\u062A\u062B\u062C\u062D\u062E\u0633\u0634\u0635\u0636\u0637\u0638\u0639\u063A\u0641\u0642\u0643\u0644\u0645\u0646\u0647\u064A'.split(
    '',
  ),
);

const FONT_SUBSTITUTION_MAP: Record<string, string> = {
  'Arial': 'Noto Sans Arabic',
  'Helvetica': 'Noto Sans Arabic',
  'Times New Roman': 'Amiri',
  'Georgia': 'Amiri',
  'Verdana': 'Tajawal',
  'Roboto': 'IBM Plex Sans Arabic',
  'Inter': 'Cairo',
  'Open Sans': 'Almarai',
  'Segoe UI': 'Dubai',
  'Calibri': 'Noto Kufi Arabic',
};

const LINE_HEIGHT_MULTIPLIER = 1.15;
const LETTER_SPACING_REDUCTION_EM = 0.02;
const RTL_PADDING_PX = 4;
const MIN_FONT_SCALE = 0.85;
const ARABIC_CHAR_WIDTH_FACTOR = 0.55;
const LATIN_CHAR_WIDTH_FACTOR = 0.5;

// ---------------------------------------------------------------------------
// Helper – detect if a string contains Arabic characters
// ---------------------------------------------------------------------------

function containsArabic(text: string): boolean {
  return ARABIC_REGEX.test(text);
}

// ---------------------------------------------------------------------------
// Helper – estimate text width
// ---------------------------------------------------------------------------

function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    if (ARABIC_REGEX.test(ch)) {
      width += fontSize * ARABIC_CHAR_WIDTH_FACTOR;
    } else {
      width += fontSize * LATIN_CHAR_WIDTH_FACTOR;
    }
  }
  return width;
}

// ---------------------------------------------------------------------------
// Helper – walk all layout nodes in a graph
// ---------------------------------------------------------------------------

function walkNodes(graph: CanonicalLayoutGraph, visitor: (node: LayoutNode) => void): void {
  for (const page of graph.pages) {
    visitNode(page.rootNode, visitor);
  }
}

function visitNode(node: LayoutNode, visitor: (node: LayoutNode) => void): void {
  visitor(node);
  if ('children' in node && Array.isArray((node as Record<string, unknown>).children)) {
    for (const child of (node as { children: LayoutNode[] }).children) {
      visitNode(child, visitor);
    }
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ArabicTypographyOptimizer {
  // -----------------------------------------------------------------------
  // optimize – main entry point
  // -----------------------------------------------------------------------

  optimize(graph: CanonicalLayoutGraph): CanonicalLayoutGraph {
    logger.info('Starting Arabic typography optimization');
    const clone: CanonicalLayoutGraph = structuredClone(graph);

    walkNodes(clone, (node: LayoutNode) => {
      const textContent = this.extractTextContent(node);
      if (!textContent || !containsArabic(textContent.text)) {
        return;
      }

      // Font substitution
      const fontFamily = this.extractFontFamily(node);
      if (fontFamily) {
        const substituted = this.substituteArabicFont(fontFamily);
        if (substituted !== fontFamily) {
          this.setFontFamily(node, substituted);
          logger.debug(`Font substituted: ${fontFamily} -> ${substituted}`, {
            nodeId: this.getNodeId(node),
          });
        }
      }

      // Typography adjustments (line-height, letter-spacing, padding)
      this.adjustTypographyInPlace(node);

      // Overflow detection and font-size reduction
      const fontSize = this.extractFontSize(node);
      const containerWidth = this.extractContainerWidth(node);
      if (fontSize > 0 && containerWidth > 0) {
        const overflow = this.detectOverflow(textContent.text, containerWidth, fontSize);
        if (overflow.overflows && overflow.suggestedFontSize !== null) {
          this.setFontSize(node, overflow.suggestedFontSize);
          logger.debug(`Font size reduced for overflow`, {
            nodeId: this.getNodeId(node),
            original: fontSize,
            reduced: overflow.suggestedFontSize,
          });
        }
      }

      // Kashida justification
      const alignment = this.extractAlignment(node);
      if (alignment === 'justify' && containerWidth > 0 && fontSize > 0) {
        const charWidth = fontSize * ARABIC_CHAR_WIDTH_FACTOR;
        const kashidaText = this.applyKashidaJustification(
          textContent.text,
          containerWidth,
          charWidth,
        );
        this.setTextContent(node, kashidaText);
      }
    });

    logger.info('Arabic typography optimization complete');
    return clone;
  }

  // -----------------------------------------------------------------------
  // applyKashidaJustification
  // -----------------------------------------------------------------------

  applyKashidaJustification(text: string, targetWidth: number, charWidth: number): string {
    const currentWidth = estimateTextWidth(text, charWidth / ARABIC_CHAR_WIDTH_FACTOR);
    if (currentWidth >= targetWidth) {
      return text;
    }

    const deficit = targetWidth - currentWidth;
    const kashidaWidth = charWidth;

    // Identify insertion points (after connecting letters)
    const insertionIndices: number[] = [];
    for (let i = 0; i < text.length; i++) {
      if (KASHIDA_CONNECTORS.has(text[i]) && i < text.length - 1 && text[i + 1] !== KASHIDA) {
        insertionIndices.push(i);
      }
    }

    if (insertionIndices.length === 0) {
      return text;
    }

    const totalKashidasNeeded = Math.floor(deficit / kashidaWidth);
    if (totalKashidasNeeded <= 0) {
      return text;
    }

    // Distribute kashida evenly across insertion points
    const kashidasPerPoint = Math.floor(totalKashidasNeeded / insertionIndices.length);
    let remainder = totalKashidasNeeded % insertionIndices.length;

    // Build result by inserting kashida after each insertion point
    const chars = Array.from(text);
    const result: string[] = [];
    const insertionSet = new Set(insertionIndices);

    for (let i = 0; i < chars.length; i++) {
      result.push(chars[i]);
      if (insertionSet.has(i)) {
        let count = kashidasPerPoint;
        if (remainder > 0) {
          count += 1;
          remainder -= 1;
        }
        for (let k = 0; k < count; k++) {
          result.push(KASHIDA);
        }
      }
    }

    return result.join('');
  }

  // -----------------------------------------------------------------------
  // wrapArabicLines
  // -----------------------------------------------------------------------

  wrapArabicLines(text: string, maxWidth: number, fontSize: number): string[] {
    const words = text.split(/(?<=\s)|(?<=\u200B)/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const candidateLine = currentLine ? currentLine + word : word;
      const candidateWidth = estimateTextWidth(candidateLine.trim(), fontSize);

      if (candidateWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine = candidateLine;
      }
    }

    if (currentLine.trim().length > 0) {
      lines.push(currentLine.trim());
    }

    return lines.length > 0 ? lines : [text];
  }

  // -----------------------------------------------------------------------
  // substituteArabicFont
  // -----------------------------------------------------------------------

  substituteArabicFont(fontFamily: string): string {
    const trimmed = fontFamily.trim();
    const mapped = FONT_SUBSTITUTION_MAP[trimmed];
    if (mapped) {
      return mapped;
    }

    // Try case-insensitive match
    for (const [latin, arabic] of Object.entries(FONT_SUBSTITUTION_MAP)) {
      if (latin.toLowerCase() === trimmed.toLowerCase()) {
        return arabic;
      }
    }

    return fontFamily;
  }

  // -----------------------------------------------------------------------
  // adjustTypography
  // -----------------------------------------------------------------------

  adjustTypography(node: LayoutNode): LayoutNode {
    const clone: LayoutNode = structuredClone(node);
    this.adjustTypographyInPlace(clone);
    return clone;
  }

  // -----------------------------------------------------------------------
  // detectOverflow
  // -----------------------------------------------------------------------

  detectOverflow(text: string, containerWidth: number, fontSize: number): OverflowResult {
    const textWidth = estimateTextWidth(text, fontSize);
    const overflows = textWidth > containerWidth;

    let suggestedFontSize: number | null = null;
    let suggestedScale = 1;

    if (overflows) {
      const requiredScale = containerWidth / textWidth;
      suggestedScale = Math.max(requiredScale, MIN_FONT_SCALE);
      suggestedFontSize = Math.round(fontSize * suggestedScale * 100) / 100;
    }

    return {
      overflows,
      textWidth,
      containerWidth,
      suggestedFontSize,
      suggestedScale,
    };
  }

  // -----------------------------------------------------------------------
  // getOptimizationReport
  // -----------------------------------------------------------------------

  getOptimizationReport(graph: CanonicalLayoutGraph): TypographyReport {
    let totalTextNodes = 0;
    let arabicTextNodes = 0;
    const adjustmentsMade: TypographyAdjustment[] = [];
    const fontSubstitutions: Array<{ original: string; substituted: string; nodeId: string }> = [];
    let overflowsDetected = 0;
    let overflowsResolved = 0;
    let kashidaInsertions = 0;

    walkNodes(graph, (node: LayoutNode) => {
      const textContent = this.extractTextContent(node);
      if (!textContent) {
        return;
      }

      totalTextNodes += 1;

      if (!containsArabic(textContent.text)) {
        return;
      }

      arabicTextNodes += 1;
      const nodeId = this.getNodeId(node);

      // Check font substitution
      const fontFamily = this.extractFontFamily(node);
      if (fontFamily) {
        const substituted = this.substituteArabicFont(fontFamily);
        if (substituted !== fontFamily) {
          fontSubstitutions.push({ original: fontFamily, substituted, nodeId });
          adjustmentsMade.push({
            nodeId,
            type: 'font-substitution',
            before: fontFamily,
            after: substituted,
          });
        }
      }

      // Check line-height adjustment
      const lineHeight = this.extractLineHeight(node);
      if (lineHeight > 0) {
        const adjusted = Math.round(lineHeight * LINE_HEIGHT_MULTIPLIER * 100) / 100;
        adjustmentsMade.push({
          nodeId,
          type: 'line-height',
          before: String(lineHeight),
          after: String(adjusted),
        });
      }

      // Check letter-spacing
      const letterSpacing = this.extractLetterSpacing(node);
      const adjustedSpacing =
        Math.round((letterSpacing - LETTER_SPACING_REDUCTION_EM) * 1000) / 1000;
      adjustmentsMade.push({
        nodeId,
        type: 'letter-spacing',
        before: `${letterSpacing}em`,
        after: `${adjustedSpacing}em`,
      });

      // Check padding
      const paddingRight = this.extractPaddingRight(node);
      adjustmentsMade.push({
        nodeId,
        type: 'padding',
        before: `${paddingRight}px`,
        after: `${paddingRight + RTL_PADDING_PX}px`,
      });

      // Check overflow
      const fontSize = this.extractFontSize(node);
      const containerWidth = this.extractContainerWidth(node);
      if (fontSize > 0 && containerWidth > 0) {
        const overflow = this.detectOverflow(textContent.text, containerWidth, fontSize);
        if (overflow.overflows) {
          overflowsDetected += 1;
          if (overflow.suggestedFontSize !== null) {
            overflowsResolved += 1;
            adjustmentsMade.push({
              nodeId,
              type: 'font-size',
              before: `${fontSize}px`,
              after: `${overflow.suggestedFontSize}px`,
            });
          }
        }
      }

      // Check kashida
      const alignment = this.extractAlignment(node);
      if (alignment === 'justify' && containerWidth > 0 && fontSize > 0) {
        const charWidth = fontSize * ARABIC_CHAR_WIDTH_FACTOR;
        const result = this.applyKashidaJustification(textContent.text, containerWidth, charWidth);
        const insertedCount = result.split(KASHIDA).length - textContent.text.split(KASHIDA).length;
        if (insertedCount > 0) {
          kashidaInsertions += insertedCount;
          adjustmentsMade.push({
            nodeId,
            type: 'kashida',
            before: String(textContent.text.length),
            after: String(result.length),
          });
        }
      }
    });

    return {
      totalTextNodes,
      arabicTextNodes,
      adjustmentsMade,
      fontSubstitutions,
      overflowsDetected,
      overflowsResolved,
      kashidaInsertions,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers – node property access
  // -----------------------------------------------------------------------

  private adjustTypographyInPlace(node: LayoutNode): void {
    const tc = this.extractTextContent(node);
    if (!tc?.font) return;

    // Adjust line height for Arabic (needs more vertical space)
    if (tc.font.lineHeight > 0) {
      tc.font.lineHeight = Math.round(tc.font.lineHeight * LINE_HEIGHT_MULTIPLIER * 100) / 100;
    }

    // Reduce letter spacing for connected Arabic script
    tc.font.letterSpacing = Math.round((tc.font.letterSpacing - LETTER_SPACING_REDUCTION_EM) * 1000) / 1000;

    // Add right padding for RTL breathing room
    if (node.style?.padding) {
      node.style.padding.right += RTL_PADDING_PX;
    }
  }

  private extractTextContent(node: LayoutNode): TextContent | null {
    if (node.content && typeof node.content === 'object' && 'kind' in node.content && node.content.kind === 'text') {
      return node.content as TextContent;
    }
    return null;
  }

  private extractFontFamily(node: LayoutNode): string {
    const tc = this.extractTextContent(node);
    if (tc && tc.font && typeof tc.font.family === 'string') {
      return tc.font.family;
    }
    return '';
  }

  private setFontFamily(node: LayoutNode, fontFamily: string): void {
    const tc = this.extractTextContent(node);
    if (tc && tc.font) {
      tc.font.family = fontFamily;
    }
  }

  private extractFontSize(node: LayoutNode): number {
    const tc = this.extractTextContent(node);
    return tc?.font?.size ?? 0;
  }

  private setFontSize(node: LayoutNode, fontSize: number): void {
    const tc = this.extractTextContent(node);
    if (tc?.font) tc.font.size = fontSize;
  }

  private extractContainerWidth(node: LayoutNode): number {
    return node.bbox?.width ?? 0;
  }

  private extractAlignment(node: LayoutNode): string {
    const tc = this.extractTextContent(node);
    return tc?.alignment ?? '';
  }

  private extractLineHeight(node: LayoutNode): number {
    const tc = this.extractTextContent(node);
    return tc?.font?.lineHeight ?? 0;
  }

  private extractLetterSpacing(node: LayoutNode): number {
    const tc = this.extractTextContent(node);
    return tc?.font?.letterSpacing ?? 0;
  }

  private extractPaddingRight(node: LayoutNode): number {
    return node.style?.padding?.right ?? 0;
  }

  private setTextContent(node: LayoutNode, text: string): void {
    const tc = this.extractTextContent(node);
    if (tc) tc.text = text;
  }

  private getNodeId(node: LayoutNode): string {
    return node.id ?? 'unknown';
  }
}
