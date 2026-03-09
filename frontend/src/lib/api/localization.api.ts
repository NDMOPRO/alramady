import { api } from '@/lib/api';

// --- Interfaces ---

export interface TranslateInput {
  text: string;
  sourceLang: string;
  targetLang: string;
  domain?: 'general' | 'legal' | 'medical' | 'technical' | 'financial';
  glossaryId?: string;
}

export interface TranslateResult {
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  confidence: number;
  alternativeSuggestions?: string[];
}

export interface TranslateDocumentInput {
  fileId: string;
  sourceLang: string;
  targetLang: string;
  domain?: TranslateInput['domain'];
  preserveFormatting?: boolean;
  glossaryId?: string;
}

export interface TranslateDocumentResult {
  jobId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  outputFileId?: string;
  outputUrl?: string;
}

export interface QualityCheckInput {
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
}

export interface QualityIssue {
  type: 'accuracy' | 'fluency' | 'terminology' | 'style' | 'grammar';
  severity: 'low' | 'medium' | 'high';
  originalSegment: string;
  translatedSegment: string;
  suggestion: string;
  explanation: string;
}

export interface QualityResult {
  overallScore: number;
  issues: QualityIssue[];
  summaryAr: string;
  summaryEn: string;
}

export interface SupportedLanguage {
  code: string;
  nameAr: string;
  nameEn: string;
  direction: 'rtl' | 'ltr';
  supportedDomains: string[];
}

export interface TitleProminenceInput {
  text: string;
  language: string;
  context?: 'document' | 'presentation' | 'report' | 'email';
}

export interface TitleProminenceResult {
  formattedTitle: string;
  prominenceLevel: 'h1' | 'h2' | 'h3' | 'body';
  styleSuggestions: {
    fontSize: string;
    fontWeight: string;
    alignment: string;
    direction: 'rtl' | 'ltr';
  };
}

export interface GlossaryEntry {
  id: string;
  sourceTerm: string;
  targetTerm: string;
  sourceLang: string;
  targetLang: string;
  domain: string;
  approved: boolean;
}

export interface Glossary {
  id: string;
  name: string;
  description: string;
  sourceLang: string;
  targetLang: string;
  entryCount: number;
  createdAt: string;
}

export interface CreateGlossaryInput {
  name: string;
  description?: string;
  sourceLang: string;
  targetLang: string;
}

export interface AddGlossaryEntryInput {
  sourceTerm: string;
  targetTerm: string;
  domain?: string;
}

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

interface ApiOk {
  success: boolean;
}

// --- API ---

export const localizationApi = {
  // Translation
  translate: (input: TranslateInput) =>
    api.post<ApiSuccess<TranslateResult>>('/api/v1/localization/translate', input),

  translateDocument: (input: TranslateDocumentInput) =>
    api.post<ApiSuccess<TranslateDocumentResult>>('/api/v1/localization/translate/document', input),

  getDocumentTranslationStatus: (jobId: string) =>
    api.get<ApiSuccess<TranslateDocumentResult>>(`/api/v1/localization/translate/document/${jobId}`),

  // Quality
  checkQuality: (input: QualityCheckInput) =>
    api.post<ApiSuccess<QualityResult>>('/api/v1/localization/quality', input),

  // Languages
  listLanguages: () =>
    api.get<ApiSuccess<SupportedLanguage[]>>('/api/v1/localization/languages'),

  // Title Prominence
  analyzeTitleProminence: (input: TitleProminenceInput) =>
    api.post<ApiSuccess<TitleProminenceResult>>('/api/v1/localization/title-prominence', input),

  // Glossaries
  listGlossaries: () =>
    api.get<ApiSuccess<Glossary[]>>('/api/v1/localization/glossaries'),

  createGlossary: (input: CreateGlossaryInput) =>
    api.post<ApiSuccess<Glossary>>('/api/v1/localization/glossaries', input),

  getGlossary: (id: string) =>
    api.get<ApiSuccess<Glossary & { entries: GlossaryEntry[] }>>(`/api/v1/localization/glossaries/${id}`),

  removeGlossary: (id: string) =>
    api.del<ApiOk>(`/api/v1/localization/glossaries/${id}`),

  addGlossaryEntry: (glossaryId: string, input: AddGlossaryEntryInput) =>
    api.post<ApiSuccess<GlossaryEntry>>(`/api/v1/localization/glossaries/${glossaryId}/entries`, input),

  removeGlossaryEntry: (glossaryId: string, entryId: string) =>
    api.del<ApiOk>(`/api/v1/localization/glossaries/${glossaryId}/entries/${entryId}`),
};
