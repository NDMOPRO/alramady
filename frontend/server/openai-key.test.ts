import { describe, expect, it } from "vitest";

describe("OpenAI API Key", () => {
  it("should have OPENAI_API_KEY set in environment", () => {
    const key = process.env.OPENAI_API_KEY;
    expect(key).toBeDefined();
    expect(key).not.toBe("");
    expect(key!.startsWith("sk-")).toBe(true);
  });

  it("should be able to call OpenAI API with the key", async () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OPENAI_API_KEY not set");
    }

    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    // 200 = valid key, 401 = invalid key
    expect(response.status).toBe(200);
  }, 15000);
});
