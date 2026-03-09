"use client";

import React from "react";
import { Bot, ChevronDown, Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { askSurfaceAssistant } from "@/lib/api/ai";

export interface EmbeddedAssistantActionResult {
  message: string;
  chips?: string[];
}

export interface EmbeddedAssistantAction {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  run: () => Promise<EmbeddedAssistantActionResult> | EmbeddedAssistantActionResult;
}

export interface EmbeddedAssistantContextItem {
  label: string;
  value: string;
}

interface AssistantMessage {
  id: string;
  role: "assistant" | "user" | "error";
  title: string;
  body: string;
  chips?: string[];
}

interface EmbeddedRasidAssistantProps {
  surfaceId: string;
  surfaceName: string;
  route: string;
  intro: string;
  contextSummary: string;
  contextItems: EmbeddedAssistantContextItem[];
  actions: EmbeddedAssistantAction[];
  suggestedPrompts?: string[];
  className?: string;
}

function normalizeArabicText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function createMessageId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

function isGuidancePrompt(query: string): boolean {
  return /(ماذا|ما الذي|ماذا يمكن|كيف|ارشاد|إرشاد|ساعدني|وضح|فسر|اشرح)/.test(query);
}

function isExplicitExecutionPrompt(query: string): boolean {
  return /(نفذ|نفذي|شغل|شغّل|ابدأ|ابدا|افتح|أنشئ|انشئ|ولد|ولّد|حوّل|حول|حلل|حلّل|استخرج|قارن|طابق|صدر|صدّر|احذف|حدث|حدّث)/.test(query);
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      response?: { data?: { error?: string; message?: string } };
      message?: string;
    };

    return (
      maybeError.response?.data?.error ??
      maybeError.response?.data?.message ??
      maybeError.message ??
      "فشل تنفيذ الطلب عبر المسار الحقيقي."
    );
  }

  return "فشل تنفيذ الطلب عبر المسار الحقيقي.";
}

function buildInitialMessage(
  surfaceName: string,
  route: string,
  intro: string,
  contextSummary: string,
  actions: EmbeddedAssistantAction[]
): AssistantMessage {
  return {
    id: createMessageId("assistant"),
    role: "assistant",
    title: `مساعد راصد داخل ${surfaceName}`,
    body: `${intro} المسار الحالي ${route}. ${contextSummary}`,
    chips: actions.slice(0, 4).map((action) => action.label),
  };
}

function findMatchingAction(
  query: string,
  actions: EmbeddedAssistantAction[]
): EmbeddedAssistantAction | null {
  const normalizedQuery = normalizeArabicText(query);
  const queryTerms = normalizedQuery.split(" ").filter(Boolean);

  let bestMatch: { action: EmbeddedAssistantAction; score: number } | null = null;

  for (const action of actions) {
    const normalizedLabel = normalizeArabicText(action.label);
    const normalizedDescription = normalizeArabicText(action.description);
    const normalizedKeywords = action.keywords.map((keyword) => normalizeArabicText(keyword));
    const haystacks = [normalizedLabel, normalizedDescription, ...normalizedKeywords];

    let score = 0;

    for (const haystack of haystacks) {
      if (!haystack) continue;

      if (normalizedQuery === haystack) {
        score += 10;
      }

      if (haystack.includes(normalizedQuery) || normalizedQuery.includes(haystack)) {
        score += 6;
      }

      for (const term of queryTerms) {
        if (term.length < 2) continue;
        if (haystack.includes(term)) {
          score += 2;
        }
      }
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { action, score };
    }
  }

  return bestMatch?.score ? bestMatch.action : null;
}

function shouldAutoRunAction(
  query: string,
  matchedAction: EmbeddedAssistantAction | null
): boolean {
  if (!matchedAction) {
    return false;
  }

  const normalizedQuery = normalizeArabicText(query);
  if (isGuidancePrompt(normalizedQuery)) {
    return false;
  }

  const exactForms = [
    normalizeArabicText(matchedAction.label),
    normalizeArabicText(matchedAction.description),
    ...matchedAction.keywords.map((keyword) => normalizeArabicText(keyword)),
  ].filter(Boolean);

  if (exactForms.includes(normalizedQuery)) {
    return true;
  }

  return isExplicitExecutionPrompt(normalizedQuery);
}

export default function EmbeddedRasidAssistant({
  surfaceId,
  surfaceName,
  route,
  intro,
  contextSummary,
  contextItems,
  actions,
  suggestedPrompts = [],
  className = "",
}: EmbeddedRasidAssistantProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [messages, setMessages] = React.useState<AssistantMessage[]>([
    buildInitialMessage(surfaceName, route, intro, contextSummary, actions),
  ]);
  const [runningActionId, setRunningActionId] = React.useState<string | null>(null);
  const [assistantSessionId, setAssistantSessionId] = React.useState<string | null>(null);
  const actionSignature = React.useMemo(
    () => actions.map((action) => `${action.id}:${action.label}`).join("|"),
    [actions]
  );

  React.useEffect(() => {
    setMessages((current) => {
      const firstMessage = buildInitialMessage(surfaceName, route, intro, contextSummary, actions);

      if (current.length === 0) {
        return [firstMessage];
      }

      return [firstMessage, ...current.slice(1)];
    });
  }, [actionSignature, contextSummary, intro, route, surfaceName]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const openAssistant = () => {
      setExpanded(true);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    };

    window.addEventListener("rasid:open-assistant", openAssistant as EventListener);
    return () => window.removeEventListener("rasid:open-assistant", openAssistant as EventListener);
  }, []);

  const appendMessage = React.useCallback((message: AssistantMessage) => {
    setMessages((current) => [...current, message]);
  }, []);

  const handleAction = React.useCallback(
    async (action: EmbeddedAssistantAction) => {
      setExpanded(true);
      setRunningActionId(action.id);

      appendMessage({
        id: createMessageId("user"),
        role: "user",
        title: "طلب مباشر",
        body: action.label,
      });

      try {
        const result = await action.run();
        appendMessage({
          id: createMessageId("assistant"),
          role: "assistant",
          title: "نتيجة التنفيذ",
          body: result.message,
          chips: result.chips,
        });
      } catch (error) {
        appendMessage({
          id: createMessageId("error"),
          role: "error",
          title: "تعذر التنفيذ",
          body: getErrorMessage(error),
        });
      } finally {
        setRunningActionId(null);
      }
    },
    [appendMessage]
  );

  const handlePrompt = React.useCallback(
    async (rawQuery: string) => {
      const query = rawQuery.trim();
      if (!query) {
        return;
      }

      setExpanded(true);
      appendMessage({
        id: createMessageId("user"),
        role: "user",
        title: "سؤال المستخدم",
        body: query,
      });

      const normalizedQuery = normalizeArabicText(query);

      const matchedAction = findMatchingAction(normalizedQuery, actions);
      if (matchedAction && shouldAutoRunAction(normalizedQuery, matchedAction)) {
        await handleAction(matchedAction);
        return;
      }

      const response = await askSurfaceAssistant({
        surfaceName,
        route,
        contextSummary,
        contextItems,
        actions: actions.map((action) => ({
          label: action.label,
          description: action.description,
        })),
        userMessage: query,
        sessionId: assistantSessionId ?? undefined,
        history: messages
          .slice(-4)
          .filter((message) => message.role === "assistant" || message.role === "user")
          .map((message) => ({
            role: message.role === "user" ? "user" : "assistant",
            content: `${message.title}\n${message.body}`,
          })),
      });

      setAssistantSessionId(response.sessionId);
      appendMessage({
        id: createMessageId("assistant"),
        role: "assistant",
        title: "رد راصد",
        body: response.reply,
        chips: response.suggestedChips,
      });
    },
    [
      actions,
      appendMessage,
      assistantSessionId,
      contextItems,
      contextSummary,
      handleAction,
      messages,
      route,
      surfaceName,
    ]
  );

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextValue = inputValue;
      setInputValue("");
      await handlePrompt(nextValue);
    },
    [handlePrompt, inputValue]
  );

  return (
    <section
      dir="rtl"
      data-testid={`rasid-assistant-${surfaceId}`}
      className={`rased-panel rased-motion-stagger-1 overflow-hidden !p-0 ${className}`}
    >
      <div className="bg-[linear-gradient(135deg,_#0f172a,_#16324f)] px-4 py-4 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold text-cyan-100">
              <Bot className="h-3.5 w-3.5" />
              <span>مساعد راصد</span>
            </div>
            <h3 className="mt-3 text-sm font-black">{surfaceName}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-200">{contextSummary}</p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/15"
            data-testid={`rasid-assistant-toggle-${surfaceId}`}
          >
            <span>{expanded ? "إخفاء" : "فتح"}</span>
            <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {contextItems.slice(0, 2).map((item) => (
            <span key={`${item.label}-${item.value}`} className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100">
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            {contextItems.map((item) => (
              <span key={`${item.label}-${item.value}`} className="rased-chip">
                {item.label}: {item.value}
              </span>
            ))}
          </div>

          <div className="grid gap-2">
            {actions.slice(0, 3).map((action) => {
              const isRunning = runningActionId === action.id;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => void handleAction(action)}
                  disabled={runningActionId !== null}
                  data-testid={`rasid-action-${surfaceId}-${action.id}`}
                  className={`rounded-[22px] border px-4 py-3 text-right transition-all duration-200 ${
                    isRunning
                      ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                      : "border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/60"
                  } ${runningActionId !== null && !isRunning ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                    {isRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-cyan-600" />
                    )}
                    <span>{action.label}</span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-slate-500">{action.description}</p>
                </button>
              );
            })}
          </div>

          {actions.length > 3 && (
            <details className="rased-panel-soft px-4 py-3">
              <summary className="cursor-pointer text-sm font-bold text-slate-700">
                إجراءات إضافية
              </summary>
              <div className="mt-3 grid gap-2">
                {actions.slice(3).map((action) => {
                  const isRunning = runningActionId === action.id;
                  return (
                    <button
                      key={action.id}
                    type="button"
                    onClick={() => void handleAction(action)}
                    disabled={runningActionId !== null}
                    data-testid={`rasid-action-${surfaceId}-${action.id}`}
                    className={`rounded-[22px] border px-4 py-3 text-right transition-all duration-200 ${
                      isRunning
                        ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                        : "border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/60"
                      } ${runningActionId !== null && !isRunning ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                        {isRunning ? (
                          <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />
                        ) : (
                          <Sparkles className="h-4 w-4 text-cyan-600" />
                        )}
                        <span>{action.label}</span>
                      </div>
                      <p className="mt-2 text-xs leading-6 text-slate-500">{action.description}</p>
                    </button>
                  );
                })}
              </div>
            </details>
          )}

          {suggestedPrompts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handlePrompt(prompt)}
                  className="rased-chip transition-all duration-200 hover:-translate-y-0.5"
                  data-testid={`rasid-prompt-${surfaceId}-${normalizeArabicText(prompt).replace(/\s+/g, "-")}`}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <div className="max-h-56 space-y-3 overflow-y-auto rounded-[24px] border border-slate-200 bg-slate-50/60 p-3">
            {messages.slice(-4).map((message) => {
              const messageClass =
                message.role === "user"
                  ? "ms-auto border-cyan-200 bg-cyan-50"
                  : message.role === "error"
                    ? "border-rose-200 bg-rose-50"
                    : "border-slate-200 bg-white";

              return (
                <article
                  key={message.id}
                  className={`max-w-[92%] rounded-[22px] border px-4 py-3 shadow-sm ${messageClass}`}
                >
                  <p className="text-xs font-black text-slate-900">{message.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-slate-600">{message.body}</p>
                  {message.chips && message.chips.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.chips.map((chip) => (
                        <span key={chip} className="rased-chip">
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={`اسأل راصد داخل ${surfaceName}`}
              className="rased-field flex-1"
              data-testid={`rasid-input-${surfaceId}`}
            />
            <button
              type="submit"
              className="rased-action-primary px-4"
              data-testid={`rasid-submit-${surfaceId}`}
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
