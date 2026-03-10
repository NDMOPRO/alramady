import { NextRequest } from "next/server";
import { createId, isLocalE2ERuntime, jsonData, proxyToBackend } from "@/app/api/v1/_shared/e2e-runtime";

export async function POST(request: NextRequest) {
  if (!isLocalE2ERuntime()) {
    return proxyToBackend(request, "/api/v1/ai/generate/chat");
  }

  const body = (await request.json()) as {
    sessionId?: string;
    messages?: Array<{ content?: string }>;
  };

  const lastMessage = body.messages?.[body.messages.length - 1]?.content ?? "";
  const shortReply = /كيف|ماذا|وش|ايش/.test(lastMessage)
    ? "الخطوة الأنسب الآن تظهر أمامك في الخيارات السريعة أو عبر البحث."
    : "تم استلام الطلب داخل الواجهة، ويمكنك متابعة التنفيذ من نفس الشاشة.";

  return jsonData({
    sessionId: body.sessionId ?? createId("session"),
    reply: shortReply,
    queryId: createId("query"),
    tokensUsed: Math.max(32, shortReply.length),
  });
}
