import { conversionApi } from "./client";

interface ConversionEnvelope<T> {
  success?: boolean;
  data: T;
}

export interface ConversionJob {
  id: string;
  sourceFileName: string;
  sourceFormat: string;
  targetFormat: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  resultUrl: string | null;
  errorMessage: string | null;
  fileSize: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ConvertPayload {
  file: File;
  targetFormat: string;
}

export interface SupportedFormat {
  extension: string;
  label: string;
  mimeType: string;
  targets: string[];
}

export async function convertFile(
  payload: ConvertPayload
): Promise<ConversionJob> {
  const formData = new FormData();
  formData.append("file", payload.file);
  formData.append("targetFormat", payload.targetFormat);
  const response = await conversionApi.post("/convert", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function fetchConversionJob(id: string): Promise<ConversionJob> {
  const response = await conversionApi.get(`/convert/${id}`);
  return response.data;
}

export async function fetchConversionHistory(params?: {
  page?: number;
  limit?: number;
}): Promise<{ data: ConversionJob[]; total: number }> {
  const response = await conversionApi.get("/convert/history", { params });
  return response.data;
}

export async function downloadConversionResult(id: string): Promise<Blob> {
  const response = await conversionApi.get(`/convert/${id}/download`, {
    responseType: "blob",
  });
  return response.data;
}

export async function deleteConversionJob(id: string): Promise<void> {
  await conversionApi.delete(`/convert/${id}`);
}

export async function fetchSupportedFormats(): Promise<SupportedFormat[]> {
  const response = await conversionApi.get("/convert/formats");
  return response.data;
}

async function postFileForBinaryConversion(
  route: string,
  file: File,
  query?: Record<string, string | number | undefined>
): Promise<Blob> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await conversionApi.post(route, formData, {
    params: query,
    headers: { "Content-Type": "multipart/form-data" },
    responseType: "blob",
    timeout: 120000,
  });
  return response.data;
}

export async function convertMarkdownToHtml(markdown: string): Promise<{
  html: string;
  characterCount: number;
}> {
  const response = await conversionApi.post<ConversionEnvelope<{
    html: string;
    characterCount: number;
  }>>("/convert/markdown-to-html", { markdown });
  return response.data.data;
}

export async function convertPdfToWord(file: File): Promise<Blob> {
  return postFileForBinaryConversion("/convert/pdf-to-word", file);
}

export async function convertWordToPdf(file: File): Promise<Blob> {
  return postFileForBinaryConversion("/convert/word-to-pdf", file);
}

export async function convertExcelToPdf(file: File): Promise<Blob> {
  return postFileForBinaryConversion("/convert/excel-to-pdf", file);
}

export async function convertCsvToExcel(file: File): Promise<Blob> {
  return postFileForBinaryConversion("/convert/csv-to-excel", file);
}

export async function convertExcelToCsv(
  file: File,
  sheetIndex?: number
): Promise<Blob> {
  return postFileForBinaryConversion("/convert/excel-to-csv", file, { sheetIndex });
}

export async function convertImageBinary(
  file: File,
  targetFormat: "png" | "jpg" | "webp" | "avif",
  options?: {
    width?: number;
    height?: number;
    quality?: number;
  }
): Promise<Blob> {
  return postFileForBinaryConversion("/convert/image", file, {
    targetFormat,
    width: options?.width,
    height: options?.height,
    quality: options?.quality,
  });
}
