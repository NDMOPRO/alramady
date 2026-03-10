import { NextRequest } from "next/server";
import { isLocalE2ERuntime, jsonData, proxyToBackend } from "@/app/api/v1/_shared/e2e-runtime";

export async function POST(request: NextRequest) {
  if (!isLocalE2ERuntime()) {
    return proxyToBackend(request, "/api/v1/replication/visual-replication/analyze");
  }

  await new Promise((resolve) => setTimeout(resolve, 120));
  const formData = await request.formData();
  const image = formData.get("image");
  const sourceType = request.nextUrl.searchParams.get("sourceType") ?? "screenshot";
  const name = image instanceof File ? image.name : "image.png";

  return jsonData({
    analysis: {
      sourceType,
      filename: name,
      layout: "single-view",
      strictReady: true,
    },
    elements: [
      {
        type: "image",
        description: "original-asset",
        boundingBox: { x: 0, y: 0, w: 1, h: 1 },
      },
    ],
    metadata: {
      sourceType,
      filename: name,
    },
  });
}
