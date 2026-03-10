import { NextRequest } from "next/server";
import {
  getE2EAppearance,
  isLocalE2ERuntime,
  jsonData,
  patchE2EAppearance,
  proxyToBackend,
} from "@/app/api/v1/_shared/e2e-runtime";

export async function GET(request: NextRequest) {
  if (!isLocalE2ERuntime()) {
    return proxyToBackend(request, "/api/v1/dashboard/appearance");
  }

  return jsonData(getE2EAppearance());
}

export async function PUT(request: NextRequest) {
  if (!isLocalE2ERuntime()) {
    return proxyToBackend(request, "/api/v1/dashboard/appearance");
  }

  const raw = await request.text();
  const payload =
    raw.trim().length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {};

  return jsonData(
    patchE2EAppearance({
      platformName:
        typeof payload.platformName === "string"
          ? payload.platformName
          : undefined,
      logoUrl:
        typeof payload.logoUrl === "string" || payload.logoUrl === null
          ? (payload.logoUrl as string | null)
          : undefined,
      headerTitle:
        typeof payload.headerTitle === "string"
          ? payload.headerTitle
          : undefined,
      footerText:
        typeof payload.footerText === "string" ? payload.footerText : undefined,
      activeThemeId:
        typeof payload.activeThemeId === "string" || payload.activeThemeId === null
          ? (payload.activeThemeId as string | null)
          : undefined,
      visualIdentity:
        payload.visualIdentity && typeof payload.visualIdentity === "object"
          ? (payload.visualIdentity as {
              navStyle?: string;
              density?: string;
              accentUsage?: string;
              shellStyle?: string;
            })
          : undefined,
    })
  );
}
