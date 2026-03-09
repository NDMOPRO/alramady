'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Loader2, Download, Clock, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

interface ObserverMessage {
  id: string;
  role: 'user' | 'observer';
  content: string;
  timestamp: string;
  intent?: string;
  confidence?: number;
  status?: string;
  suggestions?: string[];
  outputUrl?: string;
  steps?: Array<{
    stepName: string;
    engine: string;
    status: string;
    duration: number;
  }>;
}

const QUICK_COMMANDS = [
  { label: 'حلل البيانات', query: 'حلل بياناتي' },
  { label: 'أنشئ تقرير', query: 'أنشئ تقريرا شاملا' },
  { label: 'لوحة مؤشرات', query: 'أنشئ لوحة مؤشرات' },
  { label: 'تنبؤ', query: 'تنبأ بالاتجاهات' },
  { label: 'كشف شذوذات', query: 'اكشف الشذوذات في البيانات' },
  { label: 'عرض تقديمي', query: 'أنشئ عرضا تقديميا' },
];

export default function ObserverPage() {
  const [messages, setMessages] = useState<ObserverMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendCommand = useCallback(async (query: string) => {
    if (!query.trim() || loading) return;

    const userMsg: ObserverMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await api.post<{
        success: boolean;
        data: {
          messageId: string;
          sessionId: string;
          message: string;
          intent: { intent: string; confidence: number };
          result: {
            status: string;
            steps: Array<{
              stepName: string;
              engine: string;
              status: string;
              duration: number;
            }>;
          };
          suggestions: string[];
          outputUrl?: string;
        };
      }>('/observer/command', { query, sessionId });

      const data = response.data;
      setSessionId(data.sessionId);

      const observerMsg: ObserverMessage = {
        id: data.messageId,
        role: 'observer',
        content: data.message,
        timestamp: new Date().toISOString(),
        intent: data.intent.intent,
        confidence: data.intent.confidence,
        status: data.result.status,
        suggestions: data.suggestions,
        outputUrl: data.outputUrl,
        steps: data.result.steps,
      };
      setMessages((prev) => [...prev, observerMsg]);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'observer',
          content: `حدث خطأ: ${errorMsg}`,
          timestamp: new Date().toISOString(),
          status: 'failed',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCommand(input);
    }
  };

  return (
    <div className="flex h-[calc(100vh-80px)] gap-4" dir="rtl">
      {/* Sidebar - Quick Commands */}
      <aside className="w-64 shrink-0 rounded-xl bg-gray-900 p-4 text-white hidden lg:flex flex-col">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">أوامر سريعة</h3>
        <div className="flex flex-col gap-2">
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd.label}
              onClick={() => sendCommand(cmd.query)}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors text-right"
            >
              <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
              {cmd.label}
            </button>
          ))}
        </div>

        {/* Execution Steps Display */}
        {messages.length > 0 && messages[messages.length - 1].steps && (
          <div className="mt-6 border-t border-gray-700 pt-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">خطوات التنفيذ</h3>
            <div className="flex flex-col gap-1">
              {messages[messages.length - 1].steps?.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${
                    step.status === 'success' ? 'bg-green-400' :
                    step.status === 'failed' ? 'bg-red-400' : 'bg-gray-500'
                  }`} />
                  <span className="text-gray-400 truncate">{step.stepName}</span>
                  <span className="text-gray-600 mr-auto">{step.duration}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col rounded-xl bg-gray-950 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-800 px-6 py-4">
          <Sparkles className="h-6 w-6 text-violet-400" />
          <div>
            <h1 className="text-lg font-bold text-white">الراصد الذكي</h1>
            <p className="text-xs text-gray-500">اكتب أمرك بالعربية أو الإنجليزية</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Sparkles className="h-16 w-16 text-violet-400/30 mb-4" />
              <h2 className="text-xl font-bold text-gray-400 mb-2">مرحبا بك في الراصد الذكي</h2>
              <p className="text-sm text-gray-600 max-w-md">
                اكتب أمرك بلغتك الطبيعية وسأقوم بتحليله وتنفيذه تلقائيا عبر جميع محركات المنصة
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
            >
              <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-800 text-gray-200'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

                {msg.intent && (
                  <div className="mt-2 flex items-center gap-2 text-xs opacity-70">
                    <span className="bg-gray-700 rounded px-2 py-0.5">{msg.intent}</span>
                    <span>{Math.round((msg.confidence || 0) * 100)}%</span>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      msg.status === 'complete' ? 'bg-green-400' :
                      msg.status === 'partial' ? 'bg-yellow-400' : 'bg-red-400'
                    }`} />
                  </div>
                )}

                {msg.outputUrl && (
                  <a
                    href={msg.outputUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 rounded bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-500 transition-colors"
                  >
                    <Download className="h-3 w-3" />
                    تحميل الملف
                  </a>
                )}

                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {msg.suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendCommand(s)}
                        className="rounded-full border border-gray-600 px-3 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-1 text-[10px] opacity-40 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {new Date(msg.timestamp).toLocaleTimeString('ar-SA')}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-end">
              <div className="bg-gray-800 rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                <span className="text-sm text-gray-400">جاري التنفيذ...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-800 p-4">
          <div className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="اكتب أمرك هنا... مثال: أريد تقريرا عن المبيعات"
              disabled={loading}
              className="flex-1 bg-transparent text-white placeholder-gray-600 outline-none text-sm"
              dir="auto"
            />
            <button
              onClick={() => sendCommand(input)}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-violet-600 p-2 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
