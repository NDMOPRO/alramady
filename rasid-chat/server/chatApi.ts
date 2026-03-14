/**
 * RASID Chat API — Express routes
 * Direct OpenAI integration — no Manus Forge, no tRPC.
 * Uses local SQLite (sql.js — pure JS, no native bindings) for persistence.
 */
import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import {
  createConversation,
  getConversations,
  getConversation,
  updateConversationTitle,
  deleteConversation,
  addMessage,
  getMessages,
} from "./localDb";

const router = Router();

// Initialize OpenAI client with the user's key
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
}

// System prompt for RASID AI assistant
const RASID_SYSTEM_PROMPT = `أنت "راصد الذكي" — مساعد ذكاء اصطناعي متخصص في تحليل البيانات الوطنية وإدارتها.

أنت تعمل ضمن منصة "راصد البيانات" التابعة لمكتب إدارة البيانات الوطنية في المملكة العربية السعودية.

مهامك الأساسية:
- تحليل البيانات وتقديم رؤى مفيدة
- إنشاء التقارير والملخصات
- المساعدة في تصنيف البيانات وفق المعايير الوطنية
- تقديم توصيات لتحسين جودة البيانات
- الإجابة عن الاستفسارات المتعلقة بحوكمة البيانات

قواعد مهمة:
- أجب دائماً باللغة العربية إلا إذا طُلب منك غير ذلك
- استخدم الأرقام الإنجليزية (1, 2, 3) وليس العربية
- كن دقيقاً ومهنياً في إجاباتك
- قدم إجابات منظمة وواضحة
- استخدم التنسيق (عناوين، قوائم، جداول) عند الحاجة`;

// ==================== Conversation Routes ====================

// GET /api/chat/conversations — list all conversations
router.get("/conversations", async (_req: Request, res: Response) => {
  try {
    const conversations = await getConversations();
    res.json({ success: true, data: conversations });
  } catch (error) {
    console.error("[Chat API] Error listing conversations:", error);
    res.status(500).json({ success: false, error: "فشل في جلب المحادثات" });
  }
});

// POST /api/chat/conversations — create a new conversation
router.post("/conversations", async (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    const conversation = await createConversation(title);
    res.json({ success: true, data: conversation });
  } catch (error) {
    console.error("[Chat API] Error creating conversation:", error);
    res.status(500).json({ success: false, error: "فشل في إنشاء المحادثة" });
  }
});

// GET /api/chat/conversations/:id/messages — get messages for a conversation
router.get("/conversations/:id/messages", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const conversation = await getConversation(id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: "المحادثة غير موجودة" });
    }
    const messages = await getMessages(id);
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error("[Chat API] Error getting messages:", error);
    res.status(500).json({ success: false, error: "فشل في جلب الرسائل" });
  }
});

// PATCH /api/chat/conversations/:id — update conversation title
router.patch("/conversations/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: "العنوان مطلوب" });
    }
    await updateConversationTitle(id, title);
    res.json({ success: true });
  } catch (error) {
    console.error("[Chat API] Error updating conversation:", error);
    res.status(500).json({ success: false, error: "فشل في تحديث المحادثة" });
  }
});

// DELETE /api/chat/conversations/:id — delete a conversation
router.delete("/conversations/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await deleteConversation(id);
    res.json({ success: true });
  } catch (error) {
    console.error("[Chat API] Error deleting conversation:", error);
    res.status(500).json({ success: false, error: "فشل في حذف المحادثة" });
  }
});

// ==================== Chat / Send Message ====================

// POST /api/chat/send — send a message and get AI response
router.post("/send", async (req: Request, res: Response) => {
  try {
    const { conversationId, message } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ success: false, error: "الرسالة مطلوبة" });
    }

    let convId = conversationId;

    // Create a new conversation if none provided
    if (!convId) {
      const conv = await createConversation(message.trim().substring(0, 100));
      convId = conv.id;
    }

    // Verify conversation exists
    const conversation = await getConversation(convId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: "المحادثة غير موجودة" });
    }

    // Save user message
    const userMsg = await addMessage(convId, "user", message.trim());

    // Build messages array for OpenAI
    const history = await getMessages(convId);
    const openaiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: RASID_SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // Call OpenAI
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openaiMessages,
      max_tokens: 2048,
      temperature: 0.7,
    });

    const aiContent = completion.choices[0]?.message?.content || "عذراً، لم أتمكن من معالجة طلبك.";

    // Save assistant message
    const assistantMsg = await addMessage(convId, "assistant", aiContent);

    // Auto-title: if this is the first exchange, update the conversation title
    if (history.length <= 1) {
      const shortTitle = message.trim().substring(0, 80);
      await updateConversationTitle(convId, shortTitle);
    }

    res.json({
      success: true,
      data: {
        conversationId: convId,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
      },
    });
  } catch (error: any) {
    console.error("[Chat API] Error sending message:", error);

    // Handle OpenAI-specific errors
    if (error?.status === 401) {
      return res.status(500).json({ success: false, error: "مفتاح OpenAI غير صالح" });
    }
    if (error?.status === 429) {
      return res.status(429).json({ success: false, error: "تم تجاوز حد الطلبات، حاول لاحقاً" });
    }

    res.status(500).json({ success: false, error: "فشل في معالجة الرسالة" });
  }
});

// ==================== Streaming Chat ====================

// POST /api/chat/stream — send a message and stream AI response
router.post("/stream", async (req: Request, res: Response) => {
  try {
    const { conversationId, message } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ success: false, error: "الرسالة مطلوبة" });
    }

    let convId = conversationId;

    // Create a new conversation if none provided
    if (!convId) {
      const conv = await createConversation(message.trim().substring(0, 100));
      convId = conv.id;
    }

    const conversation = await getConversation(convId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: "المحادثة غير موجودة" });
    }

    // Save user message
    await addMessage(convId, "user", message.trim());

    // Build messages array
    const history = await getMessages(convId);
    const openaiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: RASID_SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Send conversation ID first
    res.write(`data: ${JSON.stringify({ type: "meta", conversationId: convId })}\n\n`);

    // Stream from OpenAI
    const openai = getOpenAIClient();
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openaiMessages,
      max_tokens: 2048,
      temperature: 0.7,
      stream: true,
    });

    let fullContent = "";

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        res.write(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`);
      }
    }

    // Save the complete assistant message
    const assistantMsg = await addMessage(convId, "assistant", fullContent);

    // Auto-title
    if (history.length <= 1) {
      const shortTitle = message.trim().substring(0, 80);
      await updateConversationTitle(convId, shortTitle);
    }

    // Send done event
    res.write(`data: ${JSON.stringify({ type: "done", messageId: assistantMsg.id })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error("[Chat API] Stream error:", error);

    // If headers already sent, try to send error via SSE
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: "error", error: "فشل في معالجة الرسالة" })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ success: false, error: "فشل في معالجة الرسالة" });
    }
  }
});

export default router;
