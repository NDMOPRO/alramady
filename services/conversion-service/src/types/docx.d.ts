declare module 'docx' {
  export class Document {
    constructor(options: {
      creator?: string;
      title?: string;
      description?: string;
      styles?: Record<string, unknown>;
      sections: Array<{
        properties?: Record<string, unknown>;
        children: Array<unknown>;
      }>;
    });
  }

  export class Paragraph {
    constructor(options: {
      text?: string;
      children?: Array<unknown>;
      heading?: HeadingLevel | string;
      spacing?: { after?: number; before?: number; line?: number };
      alignment?: string;
      style?: string;
      bidirectional?: boolean;
      indent?: { left?: number; right?: number; firstLine?: number };
    } | string);
  }

  export class TextRun {
    constructor(options: {
      text: string;
      bold?: boolean;
      italics?: boolean;
      underline?: Record<string, unknown>;
      size?: number;
      font?: string | { name: string };
      color?: string;
      rightToLeft?: boolean;
      break?: number;
    } | string);
  }

  export enum HeadingLevel {
    HEADING_1 = "Heading1",
    HEADING_2 = "Heading2",
    HEADING_3 = "Heading3",
    HEADING_4 = "Heading4",
    HEADING_5 = "Heading5",
    HEADING_6 = "Heading6",
    TITLE = "Title",
  }

  export class Packer {
    static toBuffer(doc: Document): Promise<Buffer>;
  }

  export class Table {
    constructor(options: {
      rows: TableRow[];
      width?: { size: number; type: string };
    });
  }

  export class TableRow {
    constructor(options: {
      children: TableCell[];
      tableHeader?: boolean;
    });
  }

  export class TableCell {
    constructor(options: {
      children: Array<unknown>;
      width?: { size: number; type: string };
      shading?: { fill: string };
      borders?: Record<string, unknown>;
    });
  }

  export class PageBreak {
    constructor();
  }

  export const AlignmentType: {
    CENTER: string;
    LEFT: string;
    RIGHT: string;
    JUSTIFIED: string;
    BOTH: string;
  };

  export const BorderStyle: {
    NONE: string;
    SINGLE: string;
    DOUBLE: string;
  };

  export const WidthType: {
    DXA: string;
    PERCENTAGE: string;
    AUTO: string;
  };
}
