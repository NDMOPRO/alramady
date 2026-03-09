import { presentationApi } from "./client";

export type PresentationStatus = "draft" | "published" | "archived";
export type SlideLayout = "title" | "content" | "two-column" | "blank";

export interface SlideElement {
  id: string;
  type: "text" | "image" | "shape" | "chart" | "table";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style: Record<string, unknown>;
}

export interface Slide {
  id: string;
  index: number;
  layout: SlideLayout;
  title: string;
  body: string;
  subtitle: string;
  leftContent: string;
  rightContent: string;
  notes: string;
  thumbnailUrl: string;
  elements: SlideElement[];
}

export interface PresentationTheme {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  backgroundColor: string;
}

export interface Presentation {
  id: string;
  name: string;
  description: string;
  slideCount: number;
  thumbnailUrl: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  status: PresentationStatus;
  tags: string[];
  slides: Slide[];
  theme: PresentationTheme;
}

export interface CreatePresentationPayload {
  name: string;
  theme?: Partial<PresentationTheme>;
  width?: number;
  height?: number;
}

export interface SourcePresentationPayload {
  content: string;
  slideCount: number;
  language: string;
  style: string;
  targetAudience?: string;
}

export interface AiGeneratePayload {
  text: string;
  slideCount: number;
  language: string;
  style: string;
}

export interface DataGeneratePayload {
  datasetId: string;
  slideCount: number;
  style: string;
}

export interface AddSlidePayload {
  layout: SlideLayout;
  title?: string;
  body?: string;
  subtitle?: string;
  leftContent?: string;
  rightContent?: string;
  notes?: string;
}

export interface UpdateSlidePayload extends AddSlidePayload {
  index: number;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data: T;
  pagination?: { total?: number };
}

interface RawPresentation {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  theme: unknown;
  slideCount: number | null;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  tags: unknown;
  slides?: RawSlide[] | null;
}

interface RawSlide {
  id: string;
  slideIndex: number;
  layout: string;
  content: unknown;
  notes: string | null;
  thumbnail: string | null;
}

interface RawTextElement {
  id?: string;
  type?: string;
  text?: string;
  options?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    [key: string]: unknown;
  };
}

const DEFAULT_THEME: PresentationTheme = {
  primaryColor: "#1a73e8",
  secondaryColor: "#ffffff",
  fontFamily: "Arial",
  backgroundColor: "#ffffff",
};

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function normalizeStatus(status: string | null | undefined): PresentationStatus {
  switch ((status || "").toLowerCase()) {
    case "published":
      return "published";
    case "archived":
      return "archived";
    default:
      return "draft";
  }
}

function normalizeTheme(theme: unknown): PresentationTheme {
  const parsed = parseJsonValue<Partial<PresentationTheme>>(theme, {});
  return {
    primaryColor: parsed.primaryColor || DEFAULT_THEME.primaryColor,
    secondaryColor: parsed.secondaryColor || DEFAULT_THEME.secondaryColor,
    fontFamily: parsed.fontFamily || DEFAULT_THEME.fontFamily,
    backgroundColor: parsed.backgroundColor || DEFAULT_THEME.backgroundColor,
  };
}

function normalizeTags(tags: unknown): string[] {
  const parsed = parseJsonValue<unknown[]>(tags, []);
  return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
}

function parseSlideContent(content: unknown, layout: SlideLayout): { layout: SlideLayout; elements: RawTextElement[] } {
  const parsed = parseJsonValue<{ layout?: SlideLayout; elements?: RawTextElement[] }>(content, {});
  return {
    layout: parsed.layout || layout,
    elements: Array.isArray(parsed.elements) ? parsed.elements : [],
  };
}

function normalizeSlideElements(elements: RawTextElement[]): SlideElement[] {
  return elements.map((element, index) => ({
    id: element.id || `element-${index}`,
    type: (element.type as SlideElement["type"]) || "text",
    x: Number(element.options?.x || 0),
    y: Number(element.options?.y || 0),
    width: Number(element.options?.w || 0),
    height: Number(element.options?.h || 0),
    content:
      typeof element.text === "string"
        ? element.text
        : typeof (element as { data?: string }).data === "string"
          ? (element as { data?: string }).data || ""
          : "",
    style: element.options || {},
  }));
}

function extractSlideText(layout: SlideLayout, elements: RawTextElement[]) {
  const textElements = elements.filter((element) => element.type === "text");
  const title = textElements[0]?.text || "";

  if (layout === "title") {
    return {
      title,
      body: "",
      subtitle: textElements[1]?.text || "",
      leftContent: "",
      rightContent: "",
    };
  }

  if (layout === "two-column") {
    return {
      title,
      body: "",
      subtitle: "",
      leftContent: textElements[1]?.text || "",
      rightContent: textElements[2]?.text || "",
    };
  }

  return {
    title,
    body: textElements.slice(1).map((element) => element.text || "").filter(Boolean).join("\n\n"),
    subtitle: "",
    leftContent: "",
    rightContent: "",
  };
}

function normalizeSlide(rawSlide: RawSlide): Slide {
  const layout = (rawSlide.layout || "content") as SlideLayout;
  const parsedContent = parseSlideContent(rawSlide.content, layout);
  const text = extractSlideText(parsedContent.layout, parsedContent.elements);

  return {
    id: rawSlide.id,
    index: rawSlide.slideIndex,
    layout: parsedContent.layout,
    title: text.title,
    body: text.body,
    subtitle: text.subtitle,
    leftContent: text.leftContent,
    rightContent: text.rightContent,
    notes: rawSlide.notes || "",
    thumbnailUrl: rawSlide.thumbnail || "",
    elements: normalizeSlideElements(parsedContent.elements),
  };
}

function normalizePresentation(rawPresentation: RawPresentation): Presentation {
  const slides = Array.isArray(rawPresentation.slides)
    ? [...rawPresentation.slides].sort((left, right) => left.slideIndex - right.slideIndex).map(normalizeSlide)
    : [];

  return {
    id: rawPresentation.id,
    name: rawPresentation.name,
    description: rawPresentation.description || "",
    slideCount: rawPresentation.slideCount ?? slides.length,
    thumbnailUrl: rawPresentation.thumbnail || "",
    createdAt: rawPresentation.createdAt,
    updatedAt: rawPresentation.updatedAt,
    createdBy: rawPresentation.userId || "",
    status: normalizeStatus(rawPresentation.status),
    tags: normalizeTags(rawPresentation.tags),
    slides,
    theme: normalizeTheme(rawPresentation.theme),
  };
}

function unwrapData<T>(response: ApiEnvelope<T> | T): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as ApiEnvelope<T>).data;
  }

  return response as T;
}

function toSlideContentPayload(payload: AddSlidePayload | UpdateSlidePayload): Record<string, unknown> {
  return {
    title: payload.title || "",
    body: payload.body || "",
    subtitle: payload.subtitle || "",
    leftContent: payload.leftContent || "",
    rightContent: payload.rightContent || "",
  };
}

export async function fetchPresentations(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}): Promise<{ data: Presentation[]; total: number }> {
  const response = await presentationApi.get<ApiEnvelope<RawPresentation[]>>("/presentations", { params });
  const rawItems = unwrapData(response.data);
  const items = Array.isArray(rawItems) ? rawItems.map(normalizePresentation) : [];
  const total = response.data.pagination?.total ?? items.length;

  return { data: items, total };
}

export async function fetchPresentation(id: string): Promise<Presentation> {
  const response = await presentationApi.get<ApiEnvelope<RawPresentation>>(`/presentations/${id}`);
  return normalizePresentation(unwrapData(response.data));
}

export async function createPresentation(payload: CreatePresentationPayload): Promise<Presentation> {
  const response = await presentationApi.post<ApiEnvelope<{ id: string }>>("/presentations", {
    name: payload.name,
    theme: payload.theme,
    width: payload.width,
    height: payload.height,
  });

  const created = unwrapData(response.data);
  return fetchPresentation(created.id);
}

export async function generatePresentationFromSource(
  payload: SourcePresentationPayload
): Promise<Presentation> {
  const response = await presentationApi.post<ApiEnvelope<{ presentationId: string }>>("/source/from-text", {
    content: payload.content,
    options: {
      slideCount: payload.slideCount,
      language: payload.language,
      style: payload.style,
      targetAudience: payload.targetAudience,
    },
  });

  return fetchPresentation(unwrapData(response.data).presentationId);
}

export async function generatePresentationFromAi(payload: AiGeneratePayload): Promise<Presentation> {
  const response = await presentationApi.post<ApiEnvelope<{ presentationId: string }>>("/ai/generate-from-text", {
    text: payload.text,
    options: {
      slideCount: payload.slideCount,
      language: payload.language,
      style: payload.style,
    },
  });

  return fetchPresentation(unwrapData(response.data).presentationId);
}

export async function generatePresentationFromData(
  payload: DataGeneratePayload
): Promise<Presentation> {
  const response = await presentationApi.post<ApiEnvelope<{ presentationId: string }>>("/ai/generate-from-data", {
    datasetId: payload.datasetId,
    options: {
      slideCount: payload.slideCount,
      style: payload.style,
    },
  });

  return fetchPresentation(unwrapData(response.data).presentationId);
}

export async function generatePresentationFromFile(
  file: File,
  options?: {
    slideCount?: number;
    style?: string;
    language?: string;
    targetAudience?: string;
    detailLevel?: "brief" | "standard" | "detailed";
  }
): Promise<Presentation> {
  const formData = new FormData();
  formData.append("file", file);
  if (options) {
    formData.append("options", JSON.stringify(options));
  }

  const response = await presentationApi.post<ApiEnvelope<{ presentationId: string }>>("/source/from-file", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    timeout: 120000,
  });

  return fetchPresentation(unwrapData(response.data).presentationId);
}

export async function updateSlide(
  presentationId: string,
  payload: UpdateSlidePayload
): Promise<void> {
  await presentationApi.put(`/presentations/${presentationId}/slides/${payload.index}`, {
    layout: payload.layout,
    content: toSlideContentPayload(payload),
    notes: payload.notes || "",
  });
}

export async function addSlide(
  presentationId: string,
  payload: AddSlidePayload
): Promise<{ id: string; slideIndex: number }> {
  const response = await presentationApi.post<ApiEnvelope<{ id: string; slideIndex: number }>>(
    `/presentations/${presentationId}/slides`,
    {
      layout: payload.layout,
      content: {
        ...toSlideContentPayload(payload),
        notes: payload.notes || "",
      },
    }
  );

  return unwrapData(response.data);
}

export async function deleteSlide(presentationId: string, slideIndex: number): Promise<void> {
  await presentationApi.delete(`/presentations/${presentationId}/slides/${slideIndex}`);
}

export async function exportPresentation(id: string, format: "pptx" | "pdf"): Promise<Blob> {
  const response = await presentationApi.get(`/presentations/${id}/export/${format}`, {
    responseType: "blob",
  });

  return response.data;
}

export async function deletePresentation(id: string): Promise<void> {
  await presentationApi.delete(`/presentations/${id}`);
}
