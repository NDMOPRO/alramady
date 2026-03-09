import { api } from '@/lib/api';

// --- Interfaces ---

export interface ConvertInput {
  fileId: string;
  targetFormat: string;
  options?: Record<string, unknown>;
}

export interface ConvertResult {
  jobId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  outputFileId?: string;
  outputUrl?: string;
}

export interface ConvertStatusResult {
  jobId: string;
  status: ConvertResult['status'];
  progress: number;
  outputFileId?: string;
  outputUrl?: string;
  error?: string;
}

export interface SupportedFormat {
  extension: string;
  mimeType: string;
  label: string;
  category: 'document' | 'spreadsheet' | 'image' | 'audio' | 'video' | 'archive';
  canConvertTo: string[];
}

export interface AudioTranscribeInput {
  fileId: string;
  language?: string;
  model?: 'whisper-1';
  timestamps?: boolean;
  speakerDiarization?: boolean;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  confidence: number;
}

export interface AudioTranscribeResult {
  jobId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  text?: string;
  segments?: TranscriptionSegment[];
  language?: string;
  duration?: number;
}

export interface LegalArchiveInput {
  fileIds: string[];
  archiveFormat: 'pdf-a' | 'pdf-a3';
  metadata: {
    caseNumber?: string;
    classification?: string;
    retentionYears?: number;
    tags?: string[];
  };
  ocrIfNeeded?: boolean;
}

export interface LegalArchiveResult {
  jobId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  archivedFiles?: {
    originalFileId: string;
    archivedFileId: string;
    archivedUrl: string;
    complianceReport: Record<string, unknown>;
  }[];
}

export interface BatchConvertInput {
  fileIds: string[];
  targetFormat: string;
  options?: Record<string, unknown>;
}

export interface BatchConvertResult {
  jobId: string;
  totalFiles: number;
  completedFiles: number;
  status: 'queued' | 'processing' | 'done' | 'failed';
  results?: ConvertStatusResult[];
}

export interface ExtendedFormatInfo {
  format: string;
  description: string;
  supportedOperations: ('read' | 'write' | 'convert')[];
}

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

// --- API ---

export const conversionApi = {
  // Supported formats
  listFormats: () =>
    api.get<ApiSuccess<SupportedFormat[]>>('/api/v1/conversion/formats'),

  listExtendedFormats: () =>
    api.get<ApiSuccess<ExtendedFormatInfo[]>>('/api/v1/conversion/formats/extended'),

  // Single file conversion
  convert: (input: ConvertInput) =>
    api.post<ApiSuccess<ConvertResult>>('/api/v1/conversion/convert', input),

  getConvertStatus: (jobId: string) =>
    api.get<ApiSuccess<ConvertStatusResult>>(`/api/v1/conversion/convert/${jobId}`),

  // Batch conversion
  batchConvert: (input: BatchConvertInput) =>
    api.post<ApiSuccess<BatchConvertResult>>('/api/v1/conversion/batch', input),

  getBatchStatus: (jobId: string) =>
    api.get<ApiSuccess<BatchConvertResult>>(`/api/v1/conversion/batch/${jobId}`),

  // Audio transcription
  transcribeAudio: (input: AudioTranscribeInput) =>
    api.post<ApiSuccess<AudioTranscribeResult>>('/api/v1/conversion/audio-transcribe', input),

  getTranscriptionStatus: (jobId: string) =>
    api.get<ApiSuccess<AudioTranscribeResult>>(`/api/v1/conversion/audio-transcribe/${jobId}`),

  // Legal archive
  archiveLegal: (input: LegalArchiveInput) =>
    api.post<ApiSuccess<LegalArchiveResult>>('/api/v1/conversion/legal-archive', input),

  getLegalArchiveStatus: (jobId: string) =>
    api.get<ApiSuccess<LegalArchiveResult>>(`/api/v1/conversion/legal-archive/${jobId}`),
};
