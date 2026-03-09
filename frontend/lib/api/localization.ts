import { localizationApi } from "./client";

interface LocalizationEnvelope<T> {
  success?: boolean;
  data: T;
  total?: number;
}

export interface TranslationRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
  glossaryId?: string;
  formality?: "formal" | "informal" | "neutral";
  domain?: string;
  toneLevel?: "formal" | "executive" | "governmental" | "technical" | "neutral";
  styleGuide?: string;
  preserveLayout?: boolean;
}

export interface TranslationResult {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  confidence: number;
  wordCount: number;
  formality: "formal" | "informal" | "neutral";
  status: "completed" | "pending" | "failed";
  createdAt: string;
  memoryHits?: number;
  contextApplied?: boolean;
}

export interface GlossarySet {
  id: string;
  name: string;
  sourceLang: string;
  targetLang: string;
  termCount: number;
  status: string;
  createdAt: string;
}

export interface GlossaryTerm {
  id: string;
  source: string;
  target: string;
  context: string | null;
  status: string;
  createdAt: string;
}

export interface DocumentTranslation {
  id: string;
  fileName: string;
  fileSize: number;
  sourceLang: string;
  targetLang: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  resultUrl: string | null;
  errorMessage: string | null;
  wordCount: number;
  createdAt: string;
  completedAt: string | null;
  extractedText?: string;
}

export interface CulturalFormat {
  original: string;
  formatted: string;
  type: string;
  locale: string;
}

export interface HijriDate {
  gregorian: string;
  hijri: string;
  hijriDay: number;
  hijriMonth: number;
  hijriMonthName: string;
  hijriYear: number;
  dayOfWeek: string;
}

export interface LanguageInfo {
  code: string;
  name: string;
  nameAr: string;
  rtl: boolean;
}

export interface LocalizationHistoryItem {
  id: string;
  workflowType: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  confidence: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface LinguisticQaResult {
  issues: Array<{
    type: string;
    severity: "error" | "warning" | "info";
    message: string;
    suggestion?: string;
  }>;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  qualityScore: number;
  passed: boolean;
}

export interface LocalizationTestResult {
  results: Array<{
    componentId: string;
    overflow: {
      detected: boolean;
      horizontal: boolean;
      vertical: boolean;
      excessWidth: number;
      excessHeight: number;
    };
    rtlValidation: {
      directionCorrect: boolean;
      needsMirroring: boolean;
      mirrored?: boolean;
    };
    passed: boolean;
  }>;
  summary: {
    totalComponents: number;
    passed: number;
    failed: number;
    overflowIssues: number;
    mirroringIssues: number;
  };
  allPassed: boolean;
}

function unwrap<T>(response: LocalizationEnvelope<T> | T): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as LocalizationEnvelope<T>).data;
  }

  return response as T;
}

export async function translateText(request: TranslationRequest): Promise<TranslationResult> {
  const response = await localizationApi.post<LocalizationEnvelope<TranslationResult>>("/text/translate", request);
  return unwrap(response.data);
}

export async function translatePlainText(request: TranslationRequest): Promise<{
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  glossaryApplied?: boolean;
  contextApplied?: boolean;
}> {
  const response = await localizationApi.post<LocalizationEnvelope<{
    translatedText: string;
    sourceLang: string;
    targetLang: string;
    glossaryApplied?: boolean;
    contextApplied?: boolean;
  }>>("/translate/text", request);
  return unwrap(response.data);
}

export async function translateDocument(
  file: File,
  sourceLang: string,
  targetLang: string,
  glossaryId?: string
): Promise<DocumentTranslation> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sourceLang", sourceLang);
  formData.append("targetLang", targetLang);
  if (glossaryId) {
    formData.append("glossaryId", glossaryId);
  }

  const response = await localizationApi.post<LocalizationEnvelope<DocumentTranslation>>("/documents/translate", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return unwrap(response.data);
}

export async function fetchTranslationHistory(params?: {
  page?: number;
  limit?: number;
}): Promise<{ data: LocalizationHistoryItem[]; total: number }> {
  const response = await localizationApi.get<LocalizationEnvelope<LocalizationHistoryItem[]>>("/translate/history", { params });
  return {
    data: response.data.data || [],
    total: response.data.total || 0,
  };
}

export async function fetchDocumentTranslations(params?: {
  page?: number;
  limit?: number;
}): Promise<{ data: DocumentTranslation[]; total: number }> {
  const response = await localizationApi.get<LocalizationEnvelope<DocumentTranslation[]>>("/translate/documents", { params });
  return {
    data: response.data.data || [],
    total: response.data.total || 0,
  };
}

export async function fetchGlossarySets(): Promise<GlossarySet[]> {
  const response = await localizationApi.get<LocalizationEnvelope<GlossarySet[]>>("/glossaries");
  return unwrap(response.data);
}

export async function createGlossarySet(payload: {
  name: string;
  sourceLang: string;
  targetLang: string;
  domain?: string;
}): Promise<GlossarySet> {
  const response = await localizationApi.post<LocalizationEnvelope<GlossarySet>>("/glossaries", payload);
  return unwrap(response.data);
}

export async function fetchGlossaryTerms(glossaryId: string, search?: string): Promise<GlossaryTerm[]> {
  const response = await localizationApi.get<LocalizationEnvelope<GlossaryTerm[]>>(`/glossaries/${glossaryId}/terms`, {
    params: { search },
  });
  return unwrap(response.data);
}

export async function createGlossaryTerm(
  glossaryId: string,
  term: { source: string; target: string; context?: string }
): Promise<GlossaryTerm> {
  const response = await localizationApi.post<LocalizationEnvelope<GlossaryTerm>>(`/glossaries/${glossaryId}/terms`, term);
  return unwrap(response.data);
}

export async function enforceGlossaryTerms(glossaryId: string, text: string): Promise<{
  processedText: string;
  replacementsCount: number;
}> {
  const response = await localizationApi.post<LocalizationEnvelope<{
    processedText: string;
    replacementsCount: number;
  }>>(`/glossaries/${glossaryId}/enforce`, { text });
  return unwrap(response.data);
}

export async function formatCultural(
  value: string,
  type: string,
  locale: string,
  currencyCode?: string
): Promise<CulturalFormat> {
  const response = await localizationApi.post<LocalizationEnvelope<CulturalFormat>>("/cultural/format", {
    value,
    type,
    locale,
    currencyCode,
  });
  return unwrap(response.data);
}

export async function convertToHijri(date: string): Promise<HijriDate> {
  const response = await localizationApi.post<LocalizationEnvelope<HijriDate>>("/cultural/hijri", { date });
  return unwrap(response.data);
}

export async function fetchSupportedLanguages(): Promise<LanguageInfo[]> {
  const response = await localizationApi.get<LocalizationEnvelope<LanguageInfo[]>>("/languages");
  return unwrap(response.data);
}

export async function downloadDocumentTranslation(id: string): Promise<Blob> {
  const response = await localizationApi.get(`/translate/document/${id}/download`, {
    responseType: "blob",
  });
  return response.data;
}

export async function detectTextLanguage(text: string): Promise<{
  language: string;
  confidence?: number;
  script?: string;
}> {
  const response = await localizationApi.post<LocalizationEnvelope<{
    language: string;
    confidence?: number;
    script?: string;
  }>>("/translate/detect", { text });
  return unwrap(response.data);
}

export async function applyRtlContent(content: string): Promise<string> {
  const response = await localizationApi.post<LocalizationEnvelope<{ content: string }>>("/rtl/apply", { content });
  return unwrap(response.data).content;
}

export async function localizePresentationContent(
  presentationId: string,
  targetLocale: string
): Promise<{
  presentationId: string;
  locale: string;
  slidesProcessed: number;
  textsTranslated: number;
  layoutMirrored: boolean;
  jobId: string;
}> {
  const response = await localizationApi.post(`/localize/presentation/${presentationId}`, { targetLocale });
  return unwrap(response.data);
}

export async function localizeReportContent(
  reportId: string,
  targetLocale: string
): Promise<{
  reportId: string;
  locale: string;
  sectionsProcessed: number;
  numbersFormatted: number;
  datesFormatted: number;
  jobId: string;
}> {
  const response = await localizationApi.post(`/localize/report/${reportId}`, { targetLocale });
  return unwrap(response.data);
}

export async function localizeDashboardContent(
  dashboardId: string,
  targetLocale: string
): Promise<{
  dashboardId: string;
  locale: string;
  widgetsProcessed: number;
  labelsTranslated: number;
  numbersFormatted: number;
  jobId: string;
}> {
  const response = await localizationApi.post(`/localize/dashboard/${dashboardId}`, { targetLocale });
  return unwrap(response.data);
}

export async function runLinguisticQa(payload: {
  sourceText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  glossary?: Array<{ source: string; target: string }>;
}): Promise<LinguisticQaResult> {
  const response = await localizationApi.post<LocalizationEnvelope<LinguisticQaResult>>("/quality/linguistic-qa", payload);
  return unwrap(response.data);
}

export async function runLocalizationTest(payload: {
  components: Array<{
    id: string;
    text: string;
    containerWidth: number;
    containerHeight: number;
    fontSize?: number;
    direction?: "ltr" | "rtl";
  }>;
  targetDirection: "ltr" | "rtl";
}): Promise<LocalizationTestResult> {
  const response = await localizationApi.post<LocalizationEnvelope<LocalizationTestResult>>("/quality/localization-test", payload);
  return unwrap(response.data);
}
