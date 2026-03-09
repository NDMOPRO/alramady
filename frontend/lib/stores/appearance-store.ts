import { create } from "zustand";
import type {
  DashboardThemeRecord,
  PlatformAppearanceRecord,
  ThemeMode,
  ThemePalette,
} from "@/lib/api/appearance";
import { OFFICIAL_PLATFORM_TAGLINE, resolvePlatformName } from "@/lib/branding";

const DEFAULT_LIGHT_PALETTE: ThemePalette = {
  primary: "#2563EB",
  primaryLight: "#60A5FA",
  primaryDark: "#1D4ED8",
  secondary: "#0F172A",
  secondaryLight: "#334155",
  secondaryDark: "#020617",
  accent: "#F97316",
  background: "#F4F7FB",
  surface: "#FFFFFF",
  surfaceMuted: "#EDF3FB",
  text: "#0F172A",
  textSecondary: "#475569",
  border: "#D8E3F0",
  success: "#15803D",
  warning: "#B45309",
  error: "#BE123C",
  info: "#0369A1",
  heroStart: "#60A5FA",
  heroMid: "#2563EB",
  heroEnd: "#F97316",
  chartColors: [
    "#2563EB",
    "#0EA5E9",
    "#14B8A6",
    "#84CC16",
    "#F59E0B",
    "#F97316",
    "#EF4444",
    "#A855F7",
  ],
};

function getPalette(theme: DashboardThemeRecord | null, mode: ThemeMode): ThemePalette {
  return theme?.palettes?.[mode] ?? DEFAULT_LIGHT_PALETTE;
}

export function applyAppearanceToDocument(
  theme: DashboardThemeRecord | null,
  mode: ThemeMode,
  appearance: PlatformAppearanceRecord | null
) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const palette = getPalette(theme, mode);
  const typography = theme?.typography;
  const radius = theme?.borderRadius ?? {};
  const shadows = theme?.shadows ?? {};

  const variables: Record<string, string> = {
    "--app-primary": palette.primary,
    "--app-primary-light": palette.primaryLight,
    "--app-primary-dark": palette.primaryDark,
    "--app-secondary": palette.secondary,
    "--app-secondary-light": palette.secondaryLight,
    "--app-secondary-dark": palette.secondaryDark,
    "--app-accent": palette.accent,
    "--app-bg": palette.background,
    "--app-surface": palette.surface,
    "--app-surface-muted": palette.surfaceMuted,
    "--app-text": palette.text,
    "--app-text-muted": palette.textSecondary,
    "--app-border": palette.border,
    "--app-success": palette.success,
    "--app-warning": palette.warning,
    "--app-error": palette.error,
    "--app-info": palette.info,
    "--app-hero-start": palette.heroStart,
    "--app-hero-mid": palette.heroMid,
    "--app-hero-end": palette.heroEnd,
    "--app-sidebar-bg":
      mode === "dark" ? "#07111F" : palette.secondaryDark,
    "--app-sidebar-border":
      mode === "dark" ? "#25364C" : "rgba(255,255,255,0.08)",
    "--app-header-bg":
      mode === "dark" ? "rgba(7,17,31,0.82)" : "rgba(255,255,255,0.82)",
    "--app-shell-glow":
      mode === "dark"
        ? "radial-gradient(circle at top left, rgba(59,130,246,0.22), transparent 40%), radial-gradient(circle at bottom right, rgba(249,115,22,0.18), transparent 35%)"
        : "radial-gradient(circle at top left, rgba(37,99,235,0.18), transparent 42%), radial-gradient(circle at bottom right, rgba(249,115,22,0.16), transparent 38%)",
    "--app-font-display": typography?.displayFamily || "Tajawal, sans-serif",
    "--app-font-arabic": typography?.fontFamilyArabic || "Tajawal, sans-serif",
    "--app-radius-sm": `${radius.sm ?? 10}px`,
    "--app-radius-md": `${radius.md ?? 16}px`,
    "--app-radius-lg": `${radius.lg ?? 22}px`,
    "--app-radius-xl": `${radius.xl ?? 30}px`,
    "--app-shadow-sm": shadows.sm || "0 10px 30px rgba(15, 23, 42, 0.08)",
    "--app-shadow-md": shadows.md || "0 20px 60px rgba(15, 23, 42, 0.12)",
    "--app-shadow-lg": shadows.lg || "0 34px 90px rgba(15, 23, 42, 0.18)",
    "--app-shadow-glow":
      shadows.glow || "0 0 0 1px rgba(255,255,255,0.12), 0 22px 64px rgba(59,130,246,0.26)",
  };

  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  root.classList.toggle("dark", mode === "dark");
  root.dataset.themeName = theme?.name || "default";
  root.dataset.shellStyle = appearance?.visualIdentity.shellStyle || "premium";

  document.title = `${resolvePlatformName(appearance?.platformName)} - ${OFFICIAL_PLATFORM_TAGLINE}`;
}

interface AppearanceState {
  initialized: boolean;
  mode: ThemeMode;
  activeTheme: DashboardThemeRecord | null;
  platformAppearance: PlatformAppearanceRecord | null;
  setAppearanceBundle: (payload: {
    mode: ThemeMode;
    activeTheme: DashboardThemeRecord | null;
    platformAppearance: PlatformAppearanceRecord | null;
  }) => void;
  setMode: (mode: ThemeMode) => void;
  setActiveTheme: (theme: DashboardThemeRecord | null) => void;
  setPlatformAppearance: (appearance: PlatformAppearanceRecord | null) => void;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  initialized: false,
  mode: "light",
  activeTheme: null,
  platformAppearance: null,
  setAppearanceBundle: ({ mode, activeTheme, platformAppearance }) => {
    set({
      initialized: true,
      mode,
      activeTheme,
      platformAppearance,
    });
    applyAppearanceToDocument(activeTheme, mode, platformAppearance);
  },
  setMode: (mode) => {
    const state = get();
    set({ mode });
    applyAppearanceToDocument(state.activeTheme, mode, state.platformAppearance);
  },
  setActiveTheme: (activeTheme) => {
    const state = get();
    set({ activeTheme });
    applyAppearanceToDocument(activeTheme, state.mode, state.platformAppearance);
  },
  setPlatformAppearance: (platformAppearance) => {
    const state = get();
    set({ platformAppearance });
    applyAppearanceToDocument(state.activeTheme, state.mode, platformAppearance);
  },
}));
