import { aiApi } from "./client";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export type MultimodalMode = "exact" | "steps" | "both";
export type MultimodalLanguageHint = "auto" | "ar" | "en";

export interface MultimodalExactExtraction {
  text: string;
  language: string;
  sourceEngine: string;
  metadata: Record<string, unknown>;
}

export interface MultimodalStructuredSteps {
  title: string;
  summary: string;
  language: string;
  steps: Array<{
    index: number;
    title: string;
    description: string;
    evidence: string[];
  }>;
}

export interface MultimodalExtractionResult {
  inputType: string;
  filename: string;
  exactExtraction?: MultimodalExactExtraction;
  structuredSteps?: MultimodalStructuredSteps;
}

export async function extractMultimodal(
  file: File,
  options: {
    mode?: MultimodalMode;
    languageHint?: MultimodalLanguageHint;
  } = {}
): Promise<MultimodalExtractionResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", options.mode ?? "both");
  formData.append("languageHint", options.languageHint ?? "auto");

  const response = await aiApi.post<ApiEnvelope<MultimodalExtractionResult>>(
    "/multimodal/extract",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    }
  );

  return response.data.data;
}
