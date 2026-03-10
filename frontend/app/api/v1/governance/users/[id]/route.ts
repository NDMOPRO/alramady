import { NextRequest } from "next/server";
import {
  getE2EUser,
  isLocalE2ERuntime,
  jsonData,
  patchE2EUser,
  proxyToBackend,
} from "@/app/api/v1/_shared/e2e-runtime";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isLocalE2ERuntime()) {
    return proxyToBackend(request, `/api/v1/governance/users/${id}`);
  }

  return jsonData(getE2EUser(id));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isLocalE2ERuntime()) {
    return proxyToBackend(request, `/api/v1/governance/users/${id}`);
  }

  const raw = await request.text();
  const payload =
    raw.trim().length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {};

  return jsonData(
    patchE2EUser(id, {
      role: typeof payload.role === "string" ? payload.role : undefined,
      status: typeof payload.status === "string" ? payload.status : undefined,
      locale: typeof payload.locale === "string" ? payload.locale : undefined,
      timezone:
        typeof payload.timezone === "string" ? payload.timezone : undefined,
      preferences:
        payload.preferences && typeof payload.preferences === "object"
          ? (payload.preferences as Record<string, unknown>)
          : undefined,
    })
  );
}
