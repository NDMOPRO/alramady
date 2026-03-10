import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { E2E_AUTH_USER } from "@/lib/auth/e2e";

const SERVER_API_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:80";

export function isLocalE2ERuntime() {
  return process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1";
}

export function createId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

export function jsonData<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

export function jsonTool<TRefs>(
  requestId: string,
  toolId: string,
  refs: TRefs,
  warnings: Array<{ code: string; message: string; severity: "info" | "warning" | "error" }> = [],
  init?: ResponseInit
) {
  return NextResponse.json(
    {
      success: true,
      data: {
        request_id: requestId,
        tool_id: toolId,
        status: "ok",
        refs,
        warnings,
      },
    },
    init
  );
}

export async function proxyToBackend(request: NextRequest, path: string) {
  const target = new URL(path, SERVER_API_URL);
  target.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export function toDataUrl(bytes: Uint8Array, mime: string) {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

type E2EUserRecord = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  tenantId: string;
  locale: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  preferences: Record<string, unknown>;
};

type E2EAppearanceRecord = {
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
};

type E2EState = {
  users: Record<string, E2EUserRecord>;
  appearance: E2EAppearanceRecord;
};

declare global {
  var __rasedE2EState: E2EState | undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function createDefaultE2EState(): E2EState {
  const timestamp = nowIso();

  return {
    users: {
      [E2E_AUTH_USER.id]: {
        id: E2E_AUTH_USER.id,
        email: E2E_AUTH_USER.email,
        name: E2E_AUTH_USER.name,
        role: E2E_AUTH_USER.role,
        status: "active",
        tenantId: "tenant-e2e",
        locale: "ar-SA",
        timezone: "Asia/Riyadh",
        createdAt: timestamp,
        updatedAt: timestamp,
        preferences: {
          appearance: {
            mode: "light",
            activeThemeId: null,
          },
        },
      },
    },
    appearance: {
      tenantId: "tenant-e2e",
      platformName: "راصد",
      logoUrl: "/rasid-mark.svg",
      headerTitle: "منصة راصد الموحدة",
      footerText: "تشغيل حي داخل الكانفس",
      activeThemeId: null,
      visualIdentity: {
        navStyle: "glass",
        density: "balanced",
        accentUsage: "smart",
        shellStyle: "premium",
      },
      updatedAt: timestamp,
    },
  };
}

export function getE2EState(): E2EState {
  if (!globalThis.__rasedE2EState) {
    globalThis.__rasedE2EState = createDefaultE2EState();
  }

  return globalThis.__rasedE2EState;
}

export function getE2EUser(id: string) {
  const state = getE2EState();

  return (
    state.users[id] || {
      ...state.users[E2E_AUTH_USER.id],
      id,
      updatedAt: nowIso(),
    }
  );
}

export function patchE2EUser(
  id: string,
  patch: Partial<Pick<E2EUserRecord, "role" | "status" | "locale" | "timezone" | "preferences">>
) {
  const state = getE2EState();
  const current = getE2EUser(id);
  const nextUser: E2EUserRecord = {
    ...current,
    ...patch,
    preferences:
      patch.preferences && typeof patch.preferences === "object"
        ? {
            ...(current.preferences || {}),
            ...patch.preferences,
          }
        : current.preferences,
    updatedAt: nowIso(),
  };

  state.users[id] = nextUser;
  return nextUser;
}

export function getE2EAppearance() {
  return getE2EState().appearance;
}

export function patchE2EAppearance(
  patch: Partial<Omit<E2EAppearanceRecord, "visualIdentity">> & {
    visualIdentity?: Partial<E2EAppearanceRecord["visualIdentity"]>;
  }
) {
  const state = getE2EState();
  state.appearance = {
    ...state.appearance,
    ...patch,
    visualIdentity:
      patch.visualIdentity && typeof patch.visualIdentity === "object"
        ? {
            ...state.appearance.visualIdentity,
            ...patch.visualIdentity,
          }
        : state.appearance.visualIdentity,
    updatedAt: nowIso(),
  };

  return state.appearance;
}
