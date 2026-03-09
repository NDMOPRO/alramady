// @ts-nocheck

const mockChatCreate = jest.fn();
const mockTranscriptionsCreate = jest.fn();
const mockPdfParse = jest.fn();
const mockMammothExtract = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
    audio: { transcriptions: { create: mockTranscriptionsCreate } },
  })),
}));

jest.mock('pdf-parse', () => ({
  __esModule: true,
  default: (...args) => mockPdfParse(...args),
}));

jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    extractRawText: (...args) => mockMammothExtract(...args),
  },
}));

jest.mock('ffmpeg-static', () => null);

import {
  MultimodalBlockedError,
  MultimodalExtractionService,
} from '../services/multimodal-extraction.service';

describe('MultimodalExtractionService', () => {
  const service = new MultimodalExtractionService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects supported input types', () => {
    expect(service.detectInputType('report.pdf', 'application/pdf')).toBe('pdf');
    expect(service.detectInputType('brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx');
    expect(service.detectInputType('capture.png', 'image/png')).toBe('image');
    expect(service.detectInputType('meeting.wav', 'audio/wav')).toBe('audio');
    expect(service.detectInputType('walkthrough.mp4', 'video/mp4')).toBe('video');
    expect(service.detectInputType('notes.txt', 'text/plain')).toBe('text');
  });

  it('extracts exact text from searchable PDFs', async () => {
    mockPdfParse.mockResolvedValueOnce({
      text: 'الفقرة الأولى\nLine two',
      numpages: 2,
      info: { Title: 'Test PDF' },
      version: '1.7',
    });

    const result = await service.extractExact(
      Buffer.from('%PDF-test'),
      'test.pdf',
      'application/pdf',
      'auto',
      'pdf',
    );

    expect(result.sourceEngine).toBe('pdf-parse');
    expect(result.language).toBe('mixed');
    expect(result.metadata.pageCount).toBe(2);
    expect(result.text).toContain('الفقرة الأولى');
  });

  it('extracts exact text from DOCX documents', async () => {
    mockMammothExtract.mockResolvedValueOnce({
      value: 'Step 1\nDo this\nStep 2\nDo that',
      messages: [],
    });

    const result = await service.extractExact(
      Buffer.from('docx'),
      'steps.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'auto',
      'docx',
    );

    expect(result.sourceEngine).toBe('mammoth');
    expect(result.text).toContain('Step 1');
  });

  it('uses OCR model output for images', async () => {
    mockChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              language: 'ar',
              fullText: 'مرحبا بالعالم\nRasid Platform',
              lines: ['مرحبا بالعالم', 'Rasid Platform'],
            }),
          },
        },
      ],
    });

    const result = await service.extractExact(
      Buffer.from('image-bytes'),
      'capture.png',
      'image/png',
      'ar',
      'image',
    );

    expect(result.text).toContain('مرحبا بالعالم');
    expect(result.sourceEngine).toBe('gpt-4o');
  });

  it('extracts structured steps from instructional content', async () => {
    mockChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'دليل التشغيل',
              summary: 'يوضح المستند مسار التنفيذ.',
              language: 'ar',
              steps: [
                { index: 1, title: 'رفع الملف', description: 'ارفع الملف إلى النظام.', evidence: ['ارفع الملف'] },
                { index: 2, title: 'مراجعة النتائج', description: 'راجع المخرجات النهائية.', evidence: ['راجع النتائج'] },
              ],
            }),
          },
        },
      ],
    });

    const result = await service['extractStructuredSteps'](
      'ارفع الملف ثم راجع النتائج.',
      'ar',
      'guide.txt',
    );

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].title).toBe('رفع الملف');
  });

  it('blocks video extraction when ffmpeg runtime is unavailable', async () => {
    await expect(
      service.extract(
        Buffer.from('video'),
        'demo.mp4',
        'video/mp4',
        'auto',
        true,
      ),
    ).rejects.toBeInstanceOf(MultimodalBlockedError);
  });
});
