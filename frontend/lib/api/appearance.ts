import { dashboardApi } from "./client";
import { getUserById, updateUser, type UserDetails } from "./governance";
import { resolveLogoUrl, resolvePlatformName, resolvePlatformTagline } from "@/lib/branding";

export type ThemeMode = "light" | "dark";

export interface ThemePalette {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  secondaryLight: string;
  secondaryDark: string;
  accent: string;
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  heroStart: string;
  heroMid: string;
  heroEnd: string;
  chartColors: string[];
}

export interface ThemeCatalogFamily {
  key: string;
  nameAr: string;
  count: number;
}

export interface ThemeCatalogItem {
  key: string;
  family: string;
  familyNameAr: string;
  style: string;
  shape: string;
  nameAr: string;
  usageAr: string;
}

export interface DashboardThemeRecord {
  id: string;
  name: string;
  description: string;
  defaultMode: ThemeMode;
  rtl: boolean;
  palettes: {
    light: ThemePalette;
    dark: ThemePalette;
  };
  typography: {
    fontFamily: string;
    fontFamilyArabic: string;
    displayFamily: string;
  };
  spacing: Record<string, number>;
  borderRadius: Record<string, number>;
  shadows: Record<string, string>;
  brandKit?: {
    platformName?: string;
    companyName?: string;
    logoUrl?: string;
    logoInvertedUrl?: string;
    headerTitle?: string;
    footerText?: string;
  };
  semanticLabelAr?: string;
  semanticDefinitionAr?: string;
  catalog: {
    totalElements: number;
    families: ThemeCatalogFamily[];
    items: ThemeCatalogItem[];
  };
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformAppearanceRecord {
  tenantId: string;
  platformName: string;
  logoUrl: string | null;
  headerTitle: string;
  footerText: string;
  activeThemeId: string | null;
  visualIdentity: {
    navStyle: string;
    density: string;
    accentUsage: string;
    shellStyle: string;
  };
  updatedAt: string;
}

export interface CreateDashboardThemePayload {
  name: string;
  description?: string;
  mode?: ThemeMode;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  fontFamily?: string;
  fontFamilyArabic?: string;
  displayFamily?: string;
  rtl?: boolean;
  semanticLabelAr?: string;
  semanticDefinitionAr?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

function normalizeAppearance(
  appearance: PlatformAppearanceRecord
): PlatformAppearanceRecord {
  return {
    ...appearance,
    platformName: resolvePlatformName(appearance.platformName),
    logoUrl: resolveLogoUrl(appearance.logoUrl),
    headerTitle: resolvePlatformTagline(appearance.headerTitle),
    footerText: appearance.footerText?.trim() || resolvePlatformTagline(undefined),
  };
}

function extractAppearancePreferences(user: UserDetails): Record<string, unknown> {
  const preferences =
    user.preferences && typeof user.preferences === "object" ? user.preferences : {};
  const appearance =
    preferences.appearance && typeof preferences.appearance === "object"
      ? preferences.appearance
      : {};

  return {
    ...preferences,
    appearance,
  };
}

export async function getDashboardThemes(): Promise<DashboardThemeRecord[]> {
  const response = await dashboardApi.get<ApiEnvelope<DashboardThemeRecord[]>>("/themes");
  return response.data.data ?? [];
}

export async function createDashboardTheme(
  payload: CreateDashboardThemePayload
): Promise<DashboardThemeRecord> {
  const response = await dashboardApi.post<ApiEnvelope<DashboardThemeRecord>>(
    "/themes",
    payload
  );
  return response.data.data;
}

export async function getDashboardThemeById(id: string): Promise<DashboardThemeRecord> {
  const response = await dashboardApi.get<ApiEnvelope<DashboardThemeRecord>>(`/themes/${id}`);
  return response.data.data;
}

export async function createDashboardThemeModeVariant(
  id: string
): Promise<DashboardThemeRecord> {
  const response = await dashboardApi.post<ApiEnvelope<DashboardThemeRecord>>(
    `/themes/${id}/variants/mode`
  );
  return response.data.data;
}

export async function createDashboardThemeRtlVariant(
  id: string
): Promise<DashboardThemeRecord> {
  const response = await dashboardApi.post<ApiEnvelope<DashboardThemeRecord>>(
    `/themes/${id}/variants/rtl`
  );
  return response.data.data;
}

export async function getPlatformAppearance(): Promise<PlatformAppearanceRecord> {
  const response = await dashboardApi.get<ApiEnvelope<PlatformAppearanceRecord>>(
    "/appearance"
  );
  return normalizeAppearance(response.data.data);
}

export async function updatePlatformAppearance(
  payload: Partial<PlatformAppearanceRecord>
): Promise<PlatformAppearanceRecord> {
  const response = await dashboardApi.put<ApiEnvelope<PlatformAppearanceRecord>>(
    "/appearance",
    payload
  );
  return normalizeAppearance(response.data.data);
}

export async function persistUserAppearancePreferences(
  userId: string,
  patch: {
    mode?: ThemeMode;
    activeThemeId?: string | null;
  }
): Promise<UserDetails> {
  const user = await getUserById(userId);
  const mergedPreferences = extractAppearancePreferences(user);
  const currentAppearance =
    mergedPreferences.appearance && typeof mergedPreferences.appearance === "object"
      ? (mergedPreferences.appearance as Record<string, unknown>)
      : {};

  return updateUser(userId, {
    preferences: {
      ...mergedPreferences,
      appearance: {
        ...currentAppearance,
        ...(patch.mode ? { mode: patch.mode } : {}),
        ...(patch.activeThemeId !== undefined
          ? { activeThemeId: patch.activeThemeId }
          : {}),
      },
    },
  });
}

export async function loadAppearanceBundle(userId: string): Promise<{
  user: UserDetails;
  appearance: PlatformAppearanceRecord;
  activeTheme: DashboardThemeRecord | null;
}> {
  const [user, appearance] = await Promise.all([
    getUserById(userId),
    getPlatformAppearance(),
  ]);

  const activeThemeId =
    ((user.preferences as Record<string, unknown> | undefined)?.appearance as
      | Record<string, unknown>
      | undefined)?.activeThemeId ??
    appearance.activeThemeId;

  const activeTheme = activeThemeId
    ? await getDashboardThemeById(String(activeThemeId))
    : null;

  return {
    user,
    appearance,
    activeTheme,
  };
}
