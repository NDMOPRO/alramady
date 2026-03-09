'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { AlertCircle, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
}

interface AiResponse {
  answer: string;
}

export default function FreeQueryPage() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: 'مرحباً! أنا مساعد رصيد الذكي. يمكنك سؤالي عن أي بيانات في النظام.\n\nHello! I am Rasid AI Assistant. Ask me anything about your data.', timestamp: '10:00' },
  ]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = [
    'ما هي أعلى 5 منتجات مبيعاً؟',
    'أظهر تقرير الأداء الشهري',
    'قارن المبيعات بين الفروع',
    'ما هي نسبة رضا العملاء؟',
  ];

  const handleSend = async () => {
    if (!query.trim() || sending) return;
    const userMessage: Message = {
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, userMessage]);
    const currentQuery = query;
    setQuery('');
    setSending(true);
    setError(null);

    try {
      const res = await api.post<AiResponse>('/api/ai/ask', { question: currentQuery, datasetIds: [] });
      const aiMessage: Message = {
        role: 'ai',
        content: res.answer,
        timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (err: any) {
      setError(err.message);
      const errorMessage: Message = {
        role: 'ai',
        content: 'عذراً، حدث خطأ أثناء معالجة سؤالك. يرجى المحاولة مرة أخرى.',
        timestamp: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الاستعلام الحر</h1>
          <p className="text-gray-500">Free Query - Ask AI About Your Data</p>
        </div>
        <div className="flex gap-2">
          <button className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">محفوظات</button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition">+ محادثة جديدة</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الاستعلامات', value: messages.filter(m => m.role === 'user').length, color: 'bg-blue-50 text-blue-700' },
          { label: 'معدل الدقة', value: '--', color: 'bg-green-50 text-green-700' },
          { label: 'وقت الاستجابة', value: '--', color: 'bg-purple-50 text-purple-700' },
          { label: 'المحادثات النشطة', value: 1, color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Chat Area */}
      <div className="bg-white rounded-xl shadow flex flex-col" style={{ height: '500px' }}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[70%] rounded-xl p-4 ${
                msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
              }`}>
                <p className="text-sm whitespace-pre-line">{msg.content}</p>
                <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>{msg.timestamp}</p>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-end">
              <div className="bg-gray-100 rounded-xl p-4 flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                <span className="text-sm text-gray-500">جاري التحليل...</span>
              </div>
            </div>
          )}
        </div>

        {/* Suggestions */}
        <div className="px-6 py-2 border-t flex gap-2 overflow-x-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => setQuery(s)}
              className="flex-shrink-0 text-xs border border-blue-200 text-blue-600 px-3 py-1 rounded-full hover:bg-blue-50 transition"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="اكتب سؤالك هنا... / Type your question..."
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={sending}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إرسال'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
