"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAppearanceStore } from "@/lib/stores/appearance-store";
import { loadAppearanceBundle } from "@/lib/api/appearance";

export default function AppearanceBootstrap() {
  const user = useAuthStore((state) => state.user);
  const setTheme = useUIStore((state) => state.setTheme);
  const setAppearanceBundle = useAppearanceStore(
    (state) => state.setAppearanceBundle
  );

  useEffect(() => {
    async function bootstrap() {
      if (!user?.id) return;

      try {
        const bundle = await loadAppearanceBundle(user.id);
        const appearancePreferences =
          bundle.user.preferences &&
          typeof bundle.user.preferences === "object" &&
          "appearance" in bundle.user.preferences &&
          typeof bundle.user.preferences.appearance === "object"
            ? (bundle.user.preferences.appearance as Record<string, unknown>)
            : {};

        const mode =
          appearancePreferences.mode === "dark" || appearancePreferences.mode === "light"
            ? (appearancePreferences.mode as "light" | "dark")
            : bundle.activeTheme?.defaultMode || "light";

        setTheme(mode);
        setAppearanceBundle({
          mode,
          activeTheme: bundle.activeTheme,
          platformAppearance: bundle.appearance,
        });
      } catch {
        // Keep the current visual state if the bootstrap request fails.
      }
    }

    void bootstrap();
  }, [setAppearanceBundle, setTheme, user?.id]);

  return null;
}
