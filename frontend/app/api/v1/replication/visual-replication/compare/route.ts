import { NextRequest } from "next/server";
import { isLocalE2ERuntime, jsonData, proxyToBackend, toDataUrl } from "@/app/api/v1/_shared/e2e-runtime";

export async function POST(request: NextRequest) {
  if (!isLocalE2ERuntime()) {
    return proxyToBackend(request, "/api/v1/replication/visual-replication/compare");
  }

  await new Promise((resolve) => setTimeout(resolve, 180));
  const formData = await request.formData();
  const original = formData.get("original");
  const reconstructed = formData.get("reconstructed");

  const originalFile = original instanceof File ? original : null;
  const reconstructedFile = reconstructed instanceof File ? reconstructed : null;

  const originalBytes = originalFile ? new Uint8Array(await originalFile.arrayBuffer()) : new Uint8Array();
  const diffImage = originalFile
    ? toDataUrl(originalBytes, originalFile.type || "image/png")
    : "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iNzAiPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iNzAiIGZpbGw9IiMwODkxYjIiLz48L3N2Zz4=";

  return jsonData({
    pixelDiff: 0,
    structuralFingerprint: 1,
    ssim: 1,
    passed: Boolean(originalFile && reconstructedFile),
    diffImage,
    dimensions: { width: 1, height: 1 },
    totalPixels: 1,
    mismatchedPixels: 0,
  });
}
