import { NextRequest } from "next/server";
import { isLocalE2ERuntime, jsonData, proxyToBackend } from "@/app/api/v1/_shared/e2e-runtime";

export async function POST(request: NextRequest) {
  if (!isLocalE2ERuntime()) {
    return proxyToBackend(request, "/api/v1/ai/rased/ui-state");
  }

  const raw = await request.text();
  const snapshot = raw ? JSON.parse(raw) : {};
  return jsonData(snapshot);
}
