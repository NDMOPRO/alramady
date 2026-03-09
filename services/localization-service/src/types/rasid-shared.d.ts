declare module '@rasid/shared' {
  export interface CanonicalLayoutGraph {
    pages: LayoutPage[];
    metadata: LayoutMetadata;
  }

  export interface LayoutPage {
    id: string;
    rootNode: LayoutNode;
    width: number;
    height: number;
  }

  export interface LayoutMetadata {
    language: string;
    direction: 'ltr' | 'rtl';
    [key: string]: unknown;
  }

  export interface LayoutNode {
    id: string;
    content: ContentNode;
    bbox: BoundingBox;
    children: LayoutNode[];
  }

  export type ContentNode = TextContent | ImageContent | ShapeContent | GenericContent;

  export interface TextContent {
    kind: 'text';
    text: string;
    language: string;
    direction: 'ltr' | 'rtl';
    font: FontToken;
    alignment: 'left' | 'right' | 'center' | 'justify';
  }

  export interface ImageContent {
    kind: 'image';
    src: string;
    alt?: string;
  }

  export interface ShapeContent {
    kind: 'shape';
    shapeType: string;
  }

  export interface GenericContent {
    kind: string;
    [key: string]: unknown;
  }

  export interface FontToken {
    family: string;
    size: number;
    weight: number;
    lineHeight: number;
    style?: string;
  }

  export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface QualityMetrics {
    cer: number;
    wer: number;
    bleu: number;
    comet: number;
    bertScore: number;
    layoutFidelity: number;
    colorAccuracy: number;
    fontAccuracy: number;
    spacingAccuracy: number;
    overallScore: number;
    issues: QualityIssue[];
  }

  export interface QualityIssue {
    type: string;
    severity: 'critical' | 'warning' | 'info';
    description: string;
    location: unknown;
    suggestion: string;
  }
}
