/**
 * RASID Chat API Tests
 * Tests local SQLite database operations (sql.js) and API endpoints
 * All localDb functions are now async
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createConversation,
  getConversations,
  getConversation,
  updateConversationTitle,
  deleteConversation,
  addMessage,
  getMessages,
  execSql,
} from "./localDb";

describe("Local SQLite Database (sql.js)", () => {
  beforeAll(async () => {
    await execSql("DELETE FROM messages");
    await execSql("DELETE FROM conversations");
  });

  afterAll(async () => {
    await execSql("DELETE FROM messages");
    await execSql("DELETE FROM conversations");
  });

  describe("Conversations", () => {
    it("should create a conversation with default title", async () => {
      const conv = await createConversation();
      expect(conv).toBeDefined();
      expect(conv.id).toBeGreaterThan(0);
      expect(conv.title).toBe("محادثة جديدة");
      expect(conv.created_at).toBeDefined();
      expect(conv.updated_at).toBeDefined();
    });

    it("should create a conversation with custom title", async () => {
      const conv = await createConversation("تحليل بيانات Q4");
      expect(conv.title).toBe("تحليل بيانات Q4");
    });

    it("should list all conversations ordered by updated_at DESC", async () => {
      const conversations = await getConversations();
      expect(conversations.length).toBeGreaterThanOrEqual(2);
      if (conversations.length >= 2) {
        expect(conversations[0].updated_at >= conversations[1].updated_at).toBe(true);
      }
    });

    it("should get a specific conversation by ID", async () => {
      const conv = await createConversation("اختبار جلب");
      const fetched = await getConversation(conv.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(conv.id);
      expect(fetched!.title).toBe("اختبار جلب");
    });

    it("should return undefined for non-existent conversation", async () => {
      const fetched = await getConversation(99999);
      expect(fetched).toBeUndefined();
    });

    it("should update conversation title", async () => {
      const conv = await createConversation("عنوان قديم");
      await updateConversationTitle(conv.id, "عنوان جديد");
      const updated = await getConversation(conv.id);
      expect(updated!.title).toBe("عنوان جديد");
    });

    it("should delete a conversation and its messages", async () => {
      const conv = await createConversation("سيتم حذفها");
      await addMessage(conv.id, "user", "رسالة اختبار");
      await addMessage(conv.id, "assistant", "رد اختبار");

      await deleteConversation(conv.id);

      const fetched = await getConversation(conv.id);
      expect(fetched).toBeUndefined();

      const msgs = await getMessages(conv.id);
      expect(msgs.length).toBe(0);
    });
  });

  describe("Messages", () => {
    it("should add a user message to a conversation", async () => {
      const conv = await createConversation("محادثة رسائل");
      const msg = await addMessage(conv.id, "user", "مرحباً");
      expect(msg).toBeDefined();
      expect(msg.id).toBeGreaterThan(0);
      expect(msg.conversation_id).toBe(conv.id);
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("مرحباً");
      expect(msg.created_at).toBeDefined();
    });

    it("should add an assistant message to a conversation", async () => {
      const conv = await createConversation("محادثة مساعد");
      const msg = await addMessage(conv.id, "assistant", "أهلاً وسهلاً");
      expect(msg.role).toBe("assistant");
      expect(msg.content).toBe("أهلاً وسهلاً");
    });

    it("should get messages in chronological order", async () => {
      const conv = await createConversation("ترتيب الرسائل");
      await addMessage(conv.id, "user", "أولاً");
      await addMessage(conv.id, "assistant", "ثانياً");
      await addMessage(conv.id, "user", "ثالثاً");

      const msgs = await getMessages(conv.id);
      expect(msgs.length).toBe(3);
      expect(msgs[0].content).toBe("أولاً");
      expect(msgs[1].content).toBe("ثانياً");
      expect(msgs[2].content).toBe("ثالثاً");
    });

    it("should return empty array for conversation with no messages", async () => {
      const conv = await createConversation("فارغة");
      const msgs = await getMessages(conv.id);
      expect(msgs.length).toBe(0);
    });

    it("should touch conversation updated_at when adding a message", async () => {
      const conv = await createConversation("تحديث الوقت");
      const originalUpdated = conv.updated_at;

      await addMessage(conv.id, "user", "رسالة جديدة");

      const updated = await getConversation(conv.id);
      expect(updated!.updated_at >= originalUpdated).toBe(true);
    });
  });
});

describe("Chat API Endpoints", () => {
  const BASE_URL = "http://localhost:3000/api/chat";

  it("GET /conversations should return empty or existing list", async () => {
    const res = await fetch(`${BASE_URL}/conversations`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("POST /conversations should create a new conversation", async () => {
    const res = await fetch(`${BASE_URL}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "اختبار API" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.title).toBe("اختبار API");
    expect(data.data.id).toBeGreaterThan(0);
  });

  it("POST /send should create conversation and return AI response", async () => {
    const res = await fetch(`${BASE_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ما هو 2+2؟" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.conversationId).toBeGreaterThan(0);
    expect(data.data.userMessage.role).toBe("user");
    expect(data.data.assistantMessage.role).toBe("assistant");
    expect(data.data.assistantMessage.content.length).toBeGreaterThan(0);
  }, 30000);

  it("POST /send with empty message should return 400", async () => {
    const res = await fetch(`${BASE_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("POST /send with non-existent conversation should return 404", async () => {
    const res = await fetch(`${BASE_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: 99999, message: "test" }),
    });
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it("GET /conversations/:id/messages should return messages", async () => {
    const sendRes = await fetch(`${BASE_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "اختبار الرسائل" }),
    });
    const sendData = await sendRes.json();
    const convId = sendData.data.conversationId;

    const res = await fetch(`${BASE_URL}/conversations/${convId}/messages`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(2);
  }, 30000);

  it("PATCH /conversations/:id should update title", async () => {
    const createRes = await fetch(`${BASE_URL}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "عنوان أصلي" }),
    });
    const createData = await createRes.json();
    const convId = createData.data.id;

    const res = await fetch(`${BASE_URL}/conversations/${convId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "عنوان محدث" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("DELETE /conversations/:id should delete conversation", async () => {
    const createRes = await fetch(`${BASE_URL}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "ستحذف" }),
    });
    const createData = await createRes.json();
    const convId = createData.data.id;

    const res = await fetch(`${BASE_URL}/conversations/${convId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const getRes = await fetch(`${BASE_URL}/conversations/${convId}/messages`);
    const getData = await getRes.json();
    expect(getData.success).toBe(false);
  });
});
