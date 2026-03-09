// @ts-nocheck

// ─── Mock Dependencies ──────────────────────────────────────────────────────

const mockConversionJobCreate = jest.fn().mockResolvedValue({ id: 'job-1' });

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    conversionJob: { create: mockConversionJobCreate },
  })),
}));

jest.mock('sharp', () => {
  const mockSharp = jest.fn().mockImplementation(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 800, height: 600, format: 'png' }),
    resize: jest.fn().mockReturnThis(),
    rotate: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    avif: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('output-image')),
  }));
  mockSharp.kernel = { lanczos3: 'lanczos3' };
  return { __esModule: true, default: mockSharp };
});

jest.mock('pdf-parse', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({
    text: 'Page 1 content\n\fPage 2 content',
    numpages: 2,
    info: { Title: 'Test PDF' },
  }),
}));

jest.mock('pdfkit', () => {
  const MockPDFDoc = jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
    font: jest.fn().mockReturnThis(),
    fontSize: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    addPage: jest.fn().mockReturnThis(),
    save: jest.fn().mockReturnThis(),
    restore: jest.fn().mockReturnThis(),
    rect: jest.fn().mockReturnThis(),
    fill: jest.fn().mockReturnThis(),
    fillColor: jest.fn().mockReturnThis(),
    stroke: jest.fn().mockReturnThis(),
    moveTo: jest.fn().mockReturnThis(),
    lineTo: jest.fn().mockReturnThis(),
    end: jest.fn(),
    y: 72,
    page: { width: 595, height: 842 },
    bufferedPageRange: jest.fn().mockReturnValue({ count: 1 }),
  }));
  return { __esModule: true, default: MockPDFDoc };
});

jest.mock('xlsx', () => ({
  read: jest.fn().mockReturnValue({
    SheetNames: ['Sheet1'],
    Sheets: { Sheet1: {} },
    Props: {},
  }),
  utils: {
    sheet_to_json: jest.fn().mockReturnValue([['Header1', 'Header2'], ['A', 'B']]),
    sheet_to_csv: jest.fn().mockReturnValue('Header1,Header2\nA,B'),
    aoa_to_sheet: jest.fn().mockReturnValue({}),
    book_new: jest.fn().mockReturnValue({ SheetNames: [], Sheets: {} }),
    book_append_sheet: jest.fn(),
  },
  write: jest.fn().mockReturnValue(Buffer.from('xlsx-output')),
}));

jest.mock('docx', () => ({
  Document: jest.fn().mockImplementation(() => ({})),
  Paragraph: jest.fn().mockImplementation((opts) => opts),
  TextRun: jest.fn().mockImplementation((opts) => opts),
  HeadingLevel: { HEADING_1: 'HEADING_1', HEADING_2: 'HEADING_2' },
  Packer: { toBuffer: jest.fn().mockResolvedValue(Buffer.from('docx-output')) },
  PageBreak: jest.fn(),
}));

jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    convertToHtml: jest.fn().mockResolvedValue({ value: '<p>Hello</p>', messages: [] }),
    extractRawText: jest.fn().mockResolvedValue({ value: 'Hello\nWorld', messages: [] }),
  },
}));

jest.mock('turndown', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    turndown: jest.fn().mockReturnValue('# Hello'),
  })),
}));

jest.mock('marked', () => ({
  marked: Object.assign(jest.fn().mockResolvedValue('<h1>Hello</h1><p>World</p>'), {
    setOptions: jest.fn(),
  }),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

// ─── Import Under Test ──────────────────────────────────────────────────────

import { FormatConverterService } from '../services/format-converter.service';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Engine 8.1 - Format Converter Service', () => {
  let converter;

  beforeEach(() => {
    jest.clearAllMocks();
    converter = new FormatConverterService();
  });

  describe('convertPDFtoWord', () => {
    it('should convert a PDF buffer to DOCX and return a job ID', async () => {
      const result = await converter.convertPDFtoWord(
        Buffer.from('fake-pdf'), 'report.pdf', 'tenant-1', 'user-1',
      );

      expect(result.outputFilename).toBe('report.docx');
      expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(result.jobId).toBe('job-1');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('convertMarkdownToHTML', () => {
    it('should convert markdown to a full HTML document', async () => {
      const result = await converter.convertMarkdownToHTML('# Hello\nWorld');

      expect(result.html).toContain('<!DOCTYPE html>');
      expect(result.html).toContain('<h1>Hello</h1>');
      expect(result.characterCount).toBeGreaterThan(0);
    });

    it('should sanitize script tags from the output', async () => {
      const { marked } = require('marked');
      marked.mockResolvedValueOnce('<script>alert("xss")</script><p>Safe</p>');

      const result = await converter.convertMarkdownToHTML('test');
      expect(result.html).not.toContain('<script>');
    });
  });

  describe('convertCSVtoExcel', () => {
    it('should convert a CSV buffer to XLSX', async () => {
      const csv = 'Name,Age\nAlice,30\nBob,25';
      const result = await converter.convertCSVtoExcel(Buffer.from(csv), 'data.csv');

      expect(result.outputFilename).toBe('data.xlsx');
      expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should throw on empty CSV', async () => {
      await expect(converter.convertCSVtoExcel(Buffer.from(''), 'empty.csv')).rejects.toThrow(
        'CSV file is empty',
      );
    });
  });

  describe('convertJSONtoCSV', () => {
    it('should convert a JSON array to CSV', async () => {
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];
      const result = await converter.convertJSONtoCSV(data);

      expect(result.csv).toContain('name');
      expect(result.csv).toContain('Alice');
      expect(result.rowCount).toBe(2);
      expect(result.columnCount).toBe(2);
    });

    it('should throw on empty array input', async () => {
      await expect(converter.convertJSONtoCSV([])).rejects.toThrow(
        'Input must be a non-empty JSON array',
      );
    });

    it('should flatten nested objects', async () => {
      const data = [{ user: { name: 'Alice', address: { city: 'Riyadh' } } }];
      const result = await converter.convertJSONtoCSV(data);

      expect(result.csv).toContain('user.name');
      expect(result.csv).toContain('user.address.city');
    });
  });

  describe('convertXMLtoJSON', () => {
    it('should convert valid XML to JSON', async () => {
      const xml = '<root><item>Hello</item><item>World</item></root>';
      const result = await converter.convertXMLtoJSON(Buffer.from(xml));

      expect(result.json).toHaveProperty('root');
      expect(result.mimeType).toBe('application/json');
    });

    it('should throw on invalid XML that does not start with a tag', async () => {
      await expect(converter.convertXMLtoJSON(Buffer.from('not xml'))).rejects.toThrow(
        'Invalid XML: content does not start with a tag',
      );
    });
  });

  describe('convertExcelToCSV', () => {
    it('should throw when sheet index is out of range', async () => {
      await expect(converter.convertExcelToCSV(Buffer.from('fake'), 5)).rejects.toThrow(
        /Sheet index 5 out of range/,
      );
    });
  });

  describe('convertImageFormat', () => {
    it('should convert an image to PNG format', async () => {
      const result = await converter.convertImageFormat(
        Buffer.from('fake-image'), 'png', { quality: 90 },
      );

      expect(result.mimeType).toBe('image/png');
      expect(result.outputFilename).toBe('converted.png');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });
  });
});
