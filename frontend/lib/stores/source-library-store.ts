import { create } from "zustand";

const STORAGE_KEY = "rasid_global_sources_v1";
const MAX_SOURCES = 1000;

export interface SourceLibraryItem {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  extension: string;
  sourceType:
    | "excel"
    | "csv"
    | "pdf"
    | "image"
    | "presentation"
    | "document"
    | "json"
    | "other";
  origin: string;
  addedAt: string;
  lastUsedAt: string | null;
  usageCount: number;
}

interface SourceLibraryState {
  sources: SourceLibraryItem[];
  initialized: boolean;
  initialize: () => void;
  addFiles: (files: File[], origin?: string) => SourceLibraryItem[];
  removeSource: (id: string) => void;
  markSourceUsed: (id: string) => void;
  clearSources: () => void;
}

function saveSources(sources: SourceLibraryItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
}

function inferType(file: File): SourceLibraryItem["sourceType"] {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".xlsm")) return "excel";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".pptx") || lower.endsWith(".ppt")) return "presentation";
  if (lower.endsWith(".docx") || lower.endsWith(".doc") || lower.endsWith(".txt")) return "document";
  if (lower.endsWith(".json")) return "json";
  if (file.type.startsWith("image/")) return "image";
  return "other";
}

function extensionFromName(name: string): string {
  const parts = name.split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
}

export const useSourceLibraryStore = create<SourceLibraryState>((set) => ({
  sources: [],
  initialized: false,

  initialize: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ initialized: true });
        return;
      }

      const parsed = JSON.parse(raw) as SourceLibraryItem[];
      if (!Array.isArray(parsed)) {
        set({ initialized: true });
        return;
      }

      set({ sources: parsed.slice(0, MAX_SOURCES), initialized: true });
    } catch {
      set({ initialized: true });
    }
  },

  addFiles: (files, origin = "upload") => {
    const now = new Date().toISOString();
    const nextItems: SourceLibraryItem[] = files.map((file, index) => ({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${index}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}-${file.size}`,
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      extension: extensionFromName(file.name),
      sourceType: inferType(file),
      origin,
      addedAt: now,
      lastUsedAt: null,
      usageCount: 0,
    }));

    set((state) => {
      const merged = [...nextItems, ...state.sources].slice(0, MAX_SOURCES);
      saveSources(merged);
      return { sources: merged };
    });

    return nextItems;
  },

  removeSource: (id) =>
    set((state) => {
      const next = state.sources.filter((s) => s.id !== id);
      saveSources(next);
      return { sources: next };
    }),

  markSourceUsed: (id) =>
    set((state) => {
      const now = new Date().toISOString();
      const next = state.sources.map((source) =>
        source.id === id
          ? {
              ...source,
              usageCount: source.usageCount + 1,
              lastUsedAt: now,
            }
          : source
      );
      saveSources(next);
      return { sources: next };
    }),

  clearSources: () =>
    set(() => {
      saveSources([]);
      return { sources: [] };
    }),
}));
