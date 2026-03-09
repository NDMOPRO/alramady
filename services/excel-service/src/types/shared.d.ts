declare module '@rasid/shared' {
  export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface FontToken {
    id: string;
    family: string;
    size: number;
    weight: number;
    style: 'normal' | 'italic' | 'oblique';
    lineHeight: number;
    letterSpacing: number;
    kerning: number;
    usage: 'heading' | 'subheading' | 'body' | 'caption' | 'label' | 'data';
    confidence: number;
    fallbackFamilies: string[];
  }

  export interface TableContent {
    kind: 'table';
    headers: TableCell[];
    rows: TableCell[][];
    mergedCells: MergedCell[];
    headerRows: number;
    headerColumns: number;
    columnWidths: number[];
    rowHeights: number[];
    borderStyle: 'full' | 'horizontal' | 'minimal' | 'none';
    alternateRowColor: string | null;
    headerStyle: {
      backgroundColor: string;
      font: FontToken;
      color: string;
    };
  }

  export interface TableCell {
    value: string;
    type: 'text' | 'number' | 'date' | 'currency' | 'percentage' | 'formula';
    font: FontToken | null;
    color: string | null;
    backgroundColor: string | null;
    alignment: 'left' | 'center' | 'right';
    verticalAlignment: 'top' | 'middle' | 'bottom';
    colSpan: number;
    rowSpan: number;
  }

  export interface MergedCell {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  }
}
