"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brush,
  Eye,
  Loader2,
  MoonStar,
  Palette,
  Sparkles,
  SunMedium,
  SwatchBook,
  Type,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAppearanceStore } from "@/lib/stores/appearance-store";
import {
  createDashboardTheme,
  getDashboardThemes,
  getPlatformAppearance,
  loadAppearanceBundle,
  persistUserAppearancePreferences,
  updatePlatformAppearance,
  type CreateDashboardThemePayload,
  type DashboardThemeRecord,
  type PlatformAppearanceRecord,
  type ThemeMode,
} from "@/lib/api/appearance";

function ThemePreviewCard({
  theme,
  active,
  mode,
  onSelect,
}: {
  theme: DashboardThemeRecord;
  active: boolean;
  mode: ThemeMode;
  onSelect: (theme: DashboardThemeRecord) => void;
}) {
  const palette = theme.palettes[mode] ?? theme.palettes.light;

  return (
    <button
      type="button"
      onClick={() => onSelect(theme)}
      className={`w-full rounded-[28px] border p-4 text-right transition ${
        active ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900" : ""
      }`}
      style={{
        background:
          "linear-gradient(160deg, var(--app-surface), rgba(255,255,255,0.05))",
        borderColor: active ? "var(--app-accent)" : "var(--app-border)",
        boxShadow: active ? "var(--app-shadow-glow)" : "var(--app-shadow-sm)",
      }}
      data-testid={`settings-theme-card-${theme.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black" style={{ color: "var(--app-text)" }}>
            {theme.name}
          </p>
          <p
            className="mt-1 text-xs leading-6"
            style={{ color: "var(--app-text-muted)" }}
          >
            {theme.semanticDefinitionAr || theme.description}
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-[11px] font-bold"
          style={{
            background: active ? "var(--app-accent)" : "var(--app-surface-muted)",
            color: active ? "#fff" : "var(--app-text-muted)",
          }}
        >
          {theme.semanticLabelAr || "ثيم"}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {[palette.primary, palette.secondary, palette.accent, palette.surfaceMuted].map(
          (value) => (
            <span
              key={`${theme.id}-${value}`}
              className="h-8 w-8 rounded-full border"
              style={{ background: value, borderColor: "rgba(255,255,255,0.18)" }}
            />
          )
        )}
      </div>

      <div
        className="mt-4 rounded-[24px] border p-4"
        style={{
          background: `linear-gradient(145deg, ${palette.heroStart}, ${palette.heroEnd})`,
          borderColor: "rgba(255,255,255,0.18)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-white/80">نمط الواجهة</p>
            <p className="mt-1 text-base font-black text-white">
              {theme.catalog.totalElements} عنصرًا بصريًا
            </p>
          </div>
          <Sparkles className="h-5 w-5 text-white" />
        </div>
      </div>
    </button>
  );
}

export default function AppearanceControlPanel() {
  const user = useAuthStore((state) => state.user);
  const uiTheme = useUIStore((state) => state.theme);
  const setUiTheme = useUIStore((state) => state.setTheme);
  const { activeTheme, platformAppearance, setAppearanceBundle, setActiveTheme, setMode, setPlatformAppearance } =
    useAppearanceStore((state) => ({
      activeTheme: state.activeTheme,
      platformAppearance: state.platformAppearance,
      setAppearanceBundle: state.setAppearanceBundle,
      setActiveTheme: state.setActiveTheme,
      setMode: state.setMode,
      setPlatformAppearance: state.setPlatformAppearance,
    }));

  const [themes, setThemes] = useState<DashboardThemeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [creatingTheme, setCreatingTheme] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appearanceDraft, setAppearanceDraft] = useState<PlatformAppearanceRecord | null>(
    null
  );
  const [themeDraft, setThemeDraft] = useState<CreateDashboardThemePayload>({
    name: "قيادي",
    description: "ثيم تنفيذي عربي يرفع الوضوح ويمنح الواجهة عمقًا بصريًا محسوبًا.",
    mode: "light",
    primaryColor: "#0F766E",
    secondaryColor: "#0F172A",
    accentColor: "#F59E0B",
    backgroundColor: "#F4F7FB",
    surfaceColor: "#FFFFFF",
    textColor: "#0F172A",
    fontFamily: "Space Grotesk",
    fontFamilyArabic: "Tajawal",
    displayFamily: "Tajawal",
    rtl: true,
    semanticLabelAr: "قيادي",
    semanticDefinitionAr: "يعني وضوحًا تنفيذيًا عاليًا، ومساحات واسعة، ولمسات تمييز مركزة.",
  });

  const activeCatalogFamilies = activeTheme?.catalog.families ?? [];

  const loadPanel = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    setError(null);
    try {
      const [themeList, bundle, liveAppearance] = await Promise.all([
        getDashboardThemes(),
        loadAppearanceBundle(user.id),
        getPlatformAppearance(),
      ]);
      const appearancePreferences =
        bundle.user.preferences &&
        typeof bundle.user.preferences === "object" &&
        "appearance" in bundle.user.preferences &&
        typeof bundle.user.preferences.appearance === "object"
          ? (bundle.user.preferences.appearance as Record<string, unknown>)
          : {};
      const mode =
        appearancePreferences.mode === "dark" || appearancePreferences.mode === "light"
          ? (appearancePreferences.mode as ThemeMode)
          : bundle.activeTheme?.defaultMode || "light";

      setThemes(themeList);
      setUiTheme(mode);
      setAppearanceBundle({
        mode,
        activeTheme: bundle.activeTheme,
        platformAppearance: liveAppearance,
      });
      setAppearanceDraft(liveAppearance);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "تعذر تحميل إعدادات المظهر."
      );
    } finally {
      setLoading(false);
    }
  }, [setAppearanceBundle, setUiTheme, user?.id]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  const handleModeChange = useCallback(
    async (mode: ThemeMode) => {
      if (!user?.id) return;
      setError(null);
      setMessage(null);
      setUiTheme(mode);
      setMode(mode);

      try {
        await persistUserAppearancePreferences(user.id, {
          mode,
          activeThemeId: platformAppearance?.activeThemeId ?? activeTheme?.id ?? null,
        });
        setMessage(`تم حفظ وضع ${mode === "dark" ? "الليل" : "النهار"} للمستخدم الحالي.`);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "تعذر حفظ وضع المظهر."
        );
      }
    },
    [activeTheme?.id, platformAppearance?.activeThemeId, setMode, setUiTheme, user?.id]
  );

  const handleSelectTheme = useCallback(
    async (theme: DashboardThemeRecord) => {
      setSavingAppearance(true);
      setError(null);
      setMessage(null);
      try {
        const nextAppearance = await updatePlatformAppearance({
          activeThemeId: theme.id,
        });
        if (user?.id) {
          await persistUserAppearancePreferences(user.id, {
            mode: uiTheme,
            activeThemeId: theme.id,
          });
        }
        setActiveTheme(theme);
        setPlatformAppearance(nextAppearance);
        setAppearanceDraft(nextAppearance);
        setMessage(`تم تفعيل الثيم ${theme.name} على مستوى المنصة.`);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "تعذر تفعيل الثيم."
        );
      } finally {
        setSavingAppearance(false);
      }
    },
    [setActiveTheme, setPlatformAppearance, uiTheme, user?.id]
  );

  const handleSaveAppearance = useCallback(async () => {
    if (!appearanceDraft) return;
    setSavingAppearance(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await updatePlatformAppearance({
        platformName: appearanceDraft.platformName,
        logoUrl: appearanceDraft.logoUrl,
        headerTitle: appearanceDraft.headerTitle,
        footerText: appearanceDraft.footerText,
        activeThemeId: appearanceDraft.activeThemeId,
        visualIdentity: appearanceDraft.visualIdentity,
      });
      setPlatformAppearance(saved);
      setAppearanceDraft(saved);
      setMessage("تم حفظ الهوية البصرية العامة للمنصة.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "تعذر حفظ إعدادات الهوية البصرية."
      );
    } finally {
      setSavingAppearance(false);
    }
  }, [appearanceDraft, setPlatformAppearance]);

  const handleCreateTheme = useCallback(async () => {
    setCreatingTheme(true);
    setError(null);
    setMessage(null);
    try {
      const created = await createDashboardTheme(themeDraft);
      setThemes((current) => [created, ...current]);
      setThemeDraft((current) => ({
        ...current,
        name: `${current.name} جديد`,
      }));
      setMessage(`تم إنشاء الثيم ${created.name} داخل dashboard-service.`);
      await handleSelectTheme(created);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "تعذر إنشاء الثيم."
      );
    } finally {
      setCreatingTheme(false);
    }
  }, [handleSelectTheme, themeDraft]);

  const visualSummary = useMemo(
    () => [
      { label: "الوضع", value: uiTheme === "dark" ? "ليلي" : "نهاري" },
      { label: "الثيم النشط", value: activeTheme?.name || "غير محدد" },
      {
        label: "الكتالوج",
        value: activeTheme ? `${activeTheme.catalog.totalElements} عنصرًا` : "غير متاح",
      },
      {
        label: "الهوية",
        value: appearanceDraft?.platformName || platformAppearance?.platformName || "راصد",
      },
    ],
    [activeTheme, appearanceDraft?.platformName, platformAppearance?.platformName, uiTheme]
  );

  if (loading) {
    return (
      <section
        className="rounded-[32px] border p-6 shadow-sm"
        style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}
      >
        <div className="flex items-center justify-center py-12 text-[var(--app-text-muted)]">
          <Loader2 className="ml-3 h-5 w-5 animate-spin" />
          <span>جار تحميل نظام المظهر الحقيقي من الخدمات...</span>
        </div>
      </section>
    );
  }

  return (
    <section
      className="rounded-[32px] border p-6 shadow-sm"
      style={{
        background: "var(--app-surface)",
        borderColor: "var(--app-border)",
        boxShadow: "var(--app-shadow-sm)",
      }}
      data-testid="settings-appearance-panel"
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold" style={{ background: "var(--app-surface-muted)", color: "var(--app-primary)" }}>
            <Sparkles className="h-4 w-4" />
            <span>النظام البصري التنفيذي</span>
          </div>
          <h2 className="mt-3 text-2xl font-black" style={{ color: "var(--app-text)" }}>
            التحكم الحقيقي بالمظهر والثيمات
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7" style={{ color: "var(--app-text-muted)" }}>
            هذا القسم يقرأ من `dashboard-service` و`governance-service` ليحفظ وضع الواجهة، وهوية
            المنصة، والثيمات القابلة لإعادة الاستخدام، ثم يطبقها مباشرة على التطبيق.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visualSummary.map((item) => (
            <div
              key={item.label}
              className="rounded-[24px] border px-4 py-3"
              style={{
                background: "var(--app-surface-muted)",
                borderColor: "var(--app-border)",
              }}
            >
              <p className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
                {item.label}
              </p>
              <p className="mt-2 text-sm font-black" style={{ color: "var(--app-text)" }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {(message || error) && (
        <div
          className="mt-5 rounded-[22px] border px-4 py-3 text-sm"
          style={{
            background: error ? "rgba(190, 24, 93, 0.08)" : "rgba(14, 165, 233, 0.08)",
            borderColor: error ? "rgba(190, 24, 93, 0.24)" : "rgba(14, 165, 233, 0.24)",
            color: error ? "var(--app-error)" : "var(--app-info)",
          }}
        >
          {error || message}
        </div>
      )}

      <div className="mt-6 grid gap-6 2xl:grid-cols-[1.25fr_0.95fr]">
        <div className="space-y-6">
          <div
            className="rounded-[28px] border p-5"
            style={{ background: "var(--app-surface-muted)", borderColor: "var(--app-border)" }}
          >
            <div className="mb-4 flex items-center gap-2">
              <Brush className="h-5 w-5" style={{ color: "var(--app-primary)" }} />
              <h3 className="text-base font-black" style={{ color: "var(--app-text)" }}>
                هوية المنصة
              </h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  اسم المنصة
                </span>
                <input
                  value={appearanceDraft?.platformName ?? ""}
                  onChange={(event) =>
                    setAppearanceDraft((current) =>
                      current
                        ? { ...current, platformName: event.target.value }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border px-3 py-2.5 outline-none"
                  style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                  data-testid="settings-platform-name"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  رابط الشعار
                </span>
                <input
                  value={appearanceDraft?.logoUrl ?? ""}
                  onChange={(event) =>
                    setAppearanceDraft((current) =>
                      current ? { ...current, logoUrl: event.target.value || null } : current
                    )
                  }
                  className="w-full rounded-2xl border px-3 py-2.5 outline-none"
                  style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                  placeholder="https://..."
                  data-testid="settings-platform-logo"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  عنوان الرأس
                </span>
                <input
                  value={appearanceDraft?.headerTitle ?? ""}
                  onChange={(event) =>
                    setAppearanceDraft((current) =>
                      current ? { ...current, headerTitle: event.target.value } : current
                    )
                  }
                  className="w-full rounded-2xl border px-3 py-2.5 outline-none"
                  style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  نص التذييل
                </span>
                <input
                  value={appearanceDraft?.footerText ?? ""}
                  onChange={(event) =>
                    setAppearanceDraft((current) =>
                      current ? { ...current, footerText: event.target.value } : current
                    )
                  }
                  className="w-full rounded-2xl border px-3 py-2.5 outline-none"
                  style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {(["navStyle", "density", "accentUsage"] as const).map((field) => (
                <label key={field} className="space-y-1 text-sm">
                  <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                    {field === "navStyle"
                      ? "نمط التصفح"
                      : field === "density"
                        ? "كثافة العناصر"
                        : "استخدام التمييز"}
                  </span>
                  <input
                    value={appearanceDraft?.visualIdentity[field] ?? ""}
                    onChange={(event) =>
                      setAppearanceDraft((current) =>
                        current
                          ? {
                              ...current,
                              visualIdentity: {
                                ...current.visualIdentity,
                                [field]: event.target.value,
                              },
                            }
                          : current
                      )
                    }
                    className="w-full rounded-2xl border px-3 py-2.5 outline-none"
                    style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                  />
                </label>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSaveAppearance()}
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black text-white"
                style={{ background: "linear-gradient(135deg, var(--app-primary), var(--app-accent))" }}
                data-testid="settings-save-platform-appearance"
              >
                {savingAppearance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                <span>حفظ الهوية البصرية</span>
              </button>
              <button
                type="button"
                onClick={() => void handleModeChange("light")}
                className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold"
                style={{
                  borderColor: uiTheme === "light" ? "var(--app-accent)" : "var(--app-border)",
                  background: uiTheme === "light" ? "var(--app-surface)" : "transparent",
                  color: "var(--app-text)",
                }}
                data-testid="settings-mode-light"
              >
                <SunMedium className="h-4 w-4" />
                <span>فاتح</span>
              </button>
              <button
                type="button"
                onClick={() => void handleModeChange("dark")}
                className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold"
                style={{
                  borderColor: uiTheme === "dark" ? "var(--app-accent)" : "var(--app-border)",
                  background: uiTheme === "dark" ? "var(--app-surface)" : "transparent",
                  color: "var(--app-text)",
                }}
                data-testid="settings-mode-dark"
              >
                <MoonStar className="h-4 w-4" />
                <span>داكن</span>
              </button>
            </div>
          </div>

          <div
            className="rounded-[28px] border p-5"
            style={{ background: "var(--app-surface-muted)", borderColor: "var(--app-border)" }}
          >
            <div className="mb-4 flex items-center gap-2">
              <Palette className="h-5 w-5" style={{ color: "var(--app-accent)" }} />
              <h3 className="text-base font-black" style={{ color: "var(--app-text)" }}>
                إنشاء ثيم قابل لإعادة الاستخدام
              </h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  الاسم
                </span>
                <input
                  value={themeDraft.name}
                  onChange={(event) =>
                    setThemeDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full rounded-2xl border px-3 py-2.5 outline-none"
                  style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                  data-testid="settings-theme-name"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  المعنى الدلالي
                </span>
                <input
                  value={themeDraft.semanticDefinitionAr ?? ""}
                  onChange={(event) =>
                    setThemeDraft((current) => ({
                      ...current,
                      semanticDefinitionAr: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border px-3 py-2.5 outline-none"
                  style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                  data-testid="settings-theme-meaning"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  اللون الأساسي
                </span>
                <input
                  type="color"
                  value={themeDraft.primaryColor}
                  onChange={(event) =>
                    setThemeDraft((current) => ({
                      ...current,
                      primaryColor: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-2xl border px-2 py-2"
                  style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}
                  data-testid="settings-theme-primary"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  لون التمييز
                </span>
                <input
                  type="color"
                  value={themeDraft.accentColor}
                  onChange={(event) =>
                    setThemeDraft((current) => ({
                      ...current,
                      accentColor: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-2xl border px-2 py-2"
                  style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}
                  data-testid="settings-theme-accent"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  خط العرض
                </span>
                <input
                  value={themeDraft.displayFamily ?? ""}
                  onChange={(event) =>
                    setThemeDraft((current) => ({
                      ...current,
                      displayFamily: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border px-3 py-2.5 outline-none"
                  style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  الخط العربي
                </span>
                <input
                  value={themeDraft.fontFamilyArabic ?? ""}
                  onChange={(event) =>
                    setThemeDraft((current) => ({
                      ...current,
                      fontFamilyArabic: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border px-3 py-2.5 outline-none"
                  style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void handleCreateTheme()}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black text-white"
              style={{ background: "linear-gradient(135deg, var(--app-secondary), var(--app-primary))" }}
              data-testid="settings-create-theme"
            >
              {creatingTheme ? <Loader2 className="h-4 w-4 animate-spin" /> : <SwatchBook className="h-4 w-4" />}
              <span>إنشاء الثيم وحفظه فعليًا</span>
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div
            className="rounded-[28px] border p-5"
            style={{ background: "var(--app-surface-muted)", borderColor: "var(--app-border)" }}
          >
            <div className="mb-4 flex items-center gap-2">
              <Type className="h-5 w-5" style={{ color: "var(--app-info)" }} />
              <h3 className="text-base font-black" style={{ color: "var(--app-text)" }}>
                الثيمات المتاحة
              </h3>
            </div>
            <div className="space-y-4">
              {themes.length === 0 ? (
                <div
                  className="rounded-[24px] border border-dashed px-4 py-10 text-center text-sm"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}
                >
                  لا توجد ثيمات محفوظة في قاعدة البيانات حتى الآن.
                </div>
              ) : (
                themes.map((theme) => (
                  <ThemePreviewCard
                    key={theme.id}
                    theme={theme}
                    active={theme.id === (platformAppearance?.activeThemeId ?? activeTheme?.id)}
                    mode={uiTheme}
                    onSelect={(value) => void handleSelectTheme(value)}
                  />
                ))
              )}
            </div>
          </div>

          <div
            className="rounded-[28px] border p-5"
            style={{ background: "var(--app-surface-muted)", borderColor: "var(--app-border)" }}
          >
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5" style={{ color: "var(--app-accent)" }} />
              <h3 className="text-base font-black" style={{ color: "var(--app-text)" }}>
                ملخص كتالوج العناصر
              </h3>
            </div>
            {activeTheme ? (
              <div className="space-y-3">
                <div
                  className="rounded-[22px] border px-4 py-3"
                  style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}
                >
                  <p className="text-sm font-black" style={{ color: "var(--app-text)" }}>
                    {activeTheme.name}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                    يحتوي على {activeTheme.catalog.totalElements} عنصرًا بصريًا مهنيًا موزعة على
                    {` ${activeTheme.catalog.families.length} `} عائلات قابلة للتطبيق.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {activeCatalogFamilies.map((family) => (
                    <div
                      key={family.key}
                      className="rounded-[22px] border px-4 py-3"
                      style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}
                    >
                      <p className="text-sm font-bold" style={{ color: "var(--app-text)" }}>
                        {family.nameAr}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                        {family.count} نمطًا قابلاً لإعادة الاستخدام
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="rounded-[22px] border border-dashed px-4 py-8 text-center text-sm"
                style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}
              >
                اختر ثيمًا أولًا لعرض كتالوج عناصره.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
