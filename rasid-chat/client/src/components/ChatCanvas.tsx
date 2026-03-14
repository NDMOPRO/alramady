/* RASID Visual DNA — Chat Canvas
   Ultra Premium animations: parallax welcome, message slide-in, typing shimmer
   Setup panels appear INSIDE the canvas, not as popups.
   Rasid character, contextual suggestions, drag-and-drop support
   Mobile-responsive
   Connected to local Express API + OpenAI (no Manus resources) */
import { useState, useRef, useEffect, useCallback } from 'react';
import MaterialIcon from './MaterialIcon';
import { CHARACTERS, QUICK_ACTIONS, CHAT_OPTIONS, SETUP_COMMON, ANALYSIS_TYPES, REPORT_SECTIONS } from '@/lib/assets';
import { useTheme } from '@/contexts/ThemeContext';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
  isStreaming?: boolean;
}

type CanvasMode = 'chat' | 'setup-report' | 'setup-dashboard' | 'setup-presentation' | 'setup-analysis' | 'setup-matching' | 'setup-arabization' | 'setup-extraction' | 'setup-translation';

export default function ChatCanvas() {
  const { theme } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('chat');
  const [dragOver, setDragOver] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);

  const character = theme === 'dark' ? CHARACTERS.char3_dark : CHARACTERS.char1_waving;
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Welcome entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setWelcomeVisible(true), 150);
    return () => clearTimeout(timer);
  }, []);

  // Parallax mouse tracking for welcome screen
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setMousePos({ x, y });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node)) {
        setChatMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ==================== AI Chat with Streaming ====================
  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const userText = input.trim();
    setInput('');

    // Check for setup panel triggers first
    const lower = userText;
    if (lower.includes('تقرير') && !lower.includes('أنشئ') && lower.length < 30) {
      setCanvasMode('setup-report');
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: userText,
        time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, userMsg]);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'تم فتح لوحة إعداد التقرير. حدد الخيارات المطلوبة ثم اضغط "تنفيذ".',
          time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        }]);
      }, 300);
      return;
    }
    if ((lower.includes('لوحة') || lower.includes('مؤشرات')) && lower.length < 30) {
      setCanvasMode('setup-dashboard');
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: userText, time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) };
      setMessages(prev => [...prev, userMsg]);
      setTimeout(() => setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: 'تم فتح لوحة إعداد لوحة المؤشرات.', time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) }]), 300);
      return;
    }

    // Add user message to UI
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      // Use streaming endpoint
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: userText,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let fullContent = '';
      const assistantMsgId = (Date.now() + 1).toString();
      let gotMeta = false;

      // Add empty assistant message for streaming
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        isStreaming: true,
      }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.type === 'meta' && data.conversationId) {
              if (!gotMeta) {
                setConversationId(data.conversationId);
                gotMeta = true;
              }
            } else if (data.type === 'chunk' && data.content) {
              fullContent += data.content;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: fullContent }
                    : m
                )
              );
            } else if (data.type === 'done') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, isStreaming: false }
                    : m
                )
              );
            } else if (data.type === 'error') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: data.error || 'حدث خطأ', isStreaming: false }
                    : m
                )
              );
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      // Ensure streaming flag is cleared
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, isStreaming: false }
            : m
        )
      );
    } catch (error) {
      console.error('[ChatCanvas] Error:', error);
      setIsTyping(false);

      // Fallback: try non-streaming endpoint
      try {
        const response = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            message: userText,
          }),
        });

        const result = await response.json();
        if (result.success) {
          if (result.data.conversationId) {
            setConversationId(result.data.conversationId);
          }
          setMessages(prev => [...prev, {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: result.data.assistantMessage.content,
            time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
          }]);
        } else {
          setMessages(prev => [...prev, {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: `عذراً، حدث خطأ: ${result.error || 'خطأ غير معروف'}`,
            time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
          }]);
        }
      } catch {
        setMessages(prev => [...prev, {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: 'عذراً، لم أتمكن من الاتصال بالخادم. تأكد من أن الخادم يعمل.',
          time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        }]);
      }
    }
  }, [input, conversationId]);

  // Handle new conversation
  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setCanvasMode('chat');
    setChatMenuOpen(false);
  }, []);

  const isEmpty = messages.length === 0 && canvasMode === 'chat';

  return (
    <div
      ref={canvasRef}
      className={`flex-1 h-full bg-card rounded-2xl flex flex-col overflow-hidden shadow-sm relative ${dragOver ? 'drop-zone-active' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => setDragOver(false)}
      onMouseMove={isEmpty ? handleMouseMove : undefined}
    >
      {/* Header */}
      <div className="h-10 sm:h-11 flex items-center justify-between px-3 sm:px-4 shrink-0 border-b border-border">
        <div className="flex items-center gap-2">
          <img src={character} alt="راصد" className="w-6 h-6 rounded-full object-contain" />
          <span className="text-[13px] sm:text-[14px] font-bold text-foreground">راصد الذكي</span>
          {isTyping && (
            <span className="text-[10px] text-primary animate-pulse-soft mr-1">يكتب...</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {canvasMode !== 'chat' && (
            <button
              onClick={() => setCanvasMode('chat')}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-primary hover:bg-primary/10 transition-all"
            >
              <MaterialIcon icon="arrow_back" size={14} />
              <span className="hidden sm:inline">المحادثة</span>
            </button>
          )}
          <div className="relative" ref={chatMenuRef}>
            <button
              onClick={() => setChatMenuOpen(!chatMenuOpen)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent transition-all active:scale-95"
            >
              <MaterialIcon icon="more_vert" size={16} className="text-muted-foreground" />
            </button>
            {chatMenuOpen && (
              <div className="absolute left-0 top-full mt-1 w-44 bg-popover rounded-xl shadow-xl border border-border py-1 z-50 animate-menu-pop">
                <button
                  onClick={handleNewConversation}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-foreground hover:bg-accent transition-all"
                >
                  <MaterialIcon icon="add" size={15} />
                  محادثة جديدة
                </button>
                {CHAT_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setChatMenuOpen(false)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-all ${
                      opt.danger
                        ? 'text-destructive hover:bg-destructive/10'
                        : 'text-foreground hover:bg-accent'
                    }`}
                  >
                    <MaterialIcon icon={opt.icon} size={15} />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Setup panels render INSIDE the canvas */}
        {canvasMode === 'setup-report' && <SetupReportPanel onBack={() => setCanvasMode('chat')} />}
        {canvasMode === 'setup-dashboard' && <SetupDashboardPanel onBack={() => setCanvasMode('chat')} />}
        {canvasMode === 'setup-analysis' && <SetupAnalysisPanel onBack={() => setCanvasMode('chat')} />}
        {canvasMode === 'setup-presentation' && <SetupPresentationPanel onBack={() => setCanvasMode('chat')} />}
        {canvasMode === 'setup-matching' && <SetupMatchingPanel onBack={() => setCanvasMode('chat')} />}
        {canvasMode === 'setup-arabization' && <SetupArabizationPanel onBack={() => setCanvasMode('chat')} />}
        {canvasMode === 'setup-extraction' && <SetupExtractionPanel onBack={() => setCanvasMode('chat')} />}
        {canvasMode === 'setup-translation' && <SetupTranslationPanel onBack={() => setCanvasMode('chat')} />}

        {canvasMode === 'chat' && isEmpty && (
          <div className="flex flex-col items-center justify-center h-full px-4 sm:px-6 relative overflow-hidden">
            {/* Ambient background effects */}
            <div className="absolute inset-0 pointer-events-none">
              <div
                className="absolute w-[300px] h-[300px] rounded-full opacity-[0.03] blur-[80px] transition-transform duration-[800ms] ease-out"
                style={{
                  background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)',
                  top: '20%',
                  left: '30%',
                  transform: `translate(${mousePos.x * 20}px, ${mousePos.y * 15}px)`,
                }}
              />
              <div
                className="absolute w-[200px] h-[200px] rounded-full opacity-[0.02] blur-[60px] transition-transform duration-[1000ms] ease-out"
                style={{
                  background: 'radial-gradient(circle, var(--gold) 0%, transparent 70%)',
                  bottom: '25%',
                  right: '25%',
                  transform: `translate(${mousePos.x * -15}px, ${mousePos.y * -10}px)`,
                }}
              />
            </div>

            {/* Character with parallax */}
            <div
              className={`relative mb-3 sm:mb-5 transition-all duration-700 ${welcomeVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-90'}`}
              style={{ transform: welcomeVisible ? `translate(${mousePos.x * 8}px, ${mousePos.y * 5}px)` : undefined }}
            >
              <div className="absolute inset-[-12px] rounded-full bg-primary/[0.03] animate-pulse-glow" />
              <img
                src={character}
                alt="راصد الذكي"
                className="w-24 h-24 sm:w-32 sm:h-32 object-contain animate-float-slow relative z-10 drop-shadow-lg"
              />
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-16 sm:w-20 h-3 bg-foreground/[0.04] rounded-full blur-md animate-pulse-soft" />
            </div>

            {/* Title with staggered entrance */}
            <h2
              className={`text-[18px] sm:text-[22px] font-extrabold text-foreground mb-1.5 transition-all duration-700 delay-200 ${welcomeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            >
              أنت تأمر <span className="text-gold relative">
                وأنا أطامر
                <span className="absolute -bottom-0.5 left-0 right-0 h-[2px] bg-gradient-to-l from-transparent via-gold/40 to-transparent" />
              </span>
            </h2>
            <p
              className={`text-[11px] sm:text-[13px] text-muted-foreground text-center max-w-[380px] mb-5 sm:mb-7 transition-all duration-700 delay-300 ${welcomeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            >
              اكتب طلبك بلغتك الطبيعية أو اختر من الأزرار أدناه
            </p>

            {/* Quick actions with staggered entrance */}
            <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 max-w-[480px]">
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={action.id}
                  onClick={() => setInput(action.label)}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/20 hover:shadow-lg transition-all duration-300 active:scale-[0.96] text-[10px] sm:text-[11px] font-medium text-foreground btn-hover-lift group ${welcomeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
                  style={{ transitionDelay: `${400 + i * 60}ms` }}
                >
                  <MaterialIcon icon={action.icon} size={15} className="text-primary transition-transform duration-200 group-hover:scale-110" />
                  {action.label}
                </button>
              ))}
            </div>

            {/* Keyboard hint at bottom */}
            <div className={`mt-6 sm:mt-8 flex items-center gap-2 transition-all duration-700 delay-[800ms] ${welcomeVisible ? 'opacity-60 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              <MaterialIcon icon="keyboard" size={14} className="text-muted-foreground/40" />
              <span className="text-[9px] text-muted-foreground/40">Enter للإرسال — Shift+Enter لسطر جديد</span>
            </div>
          </div>
        )}

        {canvasMode === 'chat' && !isEmpty && (
          <div className="flex flex-col gap-3 p-3 sm:p-4">
            {messages.map((msg, i) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                style={{
                  animation: `${msg.role === 'user' ? 'msg-slide-left' : 'msg-slide-right'} 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                  animationDelay: `${i * 0.05}s`,
                  opacity: 0,
                }}
              >
                {msg.role === 'assistant' && (
                  <div className="shrink-0 mt-1">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/5 flex items-center justify-center ring-1 ring-primary/10">
                      <img src={character} alt="راصد" className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-contain" />
                    </div>
                  </div>
                )}
                <div
                  className={`max-w-[80%] sm:max-w-[75%] px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl text-[12px] sm:text-[13px] leading-relaxed shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md shadow-primary/10'
                      : 'bg-accent/60 text-foreground rounded-bl-md border border-border/30'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.isStreaming && (
                    <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle rounded-sm" />
                  )}
                  <div className={`text-[8px] sm:text-[9px] mt-1.5 flex items-center gap-1 ${
                    msg.role === 'user' ? 'text-primary-foreground/40 justify-end' : 'text-muted-foreground/60'
                  }`}>
                    {msg.time}
                    {msg.role === 'user' && <MaterialIcon icon="done_all" size={10} />}
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-2.5" style={{ animation: 'msg-slide-right 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
                <div className="shrink-0">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/5 flex items-center justify-center ring-1 ring-primary/10">
                    <img src={character} alt="راصد" className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-contain" />
                  </div>
                </div>
                <div className="bg-accent/60 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 border border-border/30">
                  <span className="w-2 h-2 bg-primary/40 rounded-full typing-dot" />
                  <span className="w-2 h-2 bg-primary/40 rounded-full typing-dot" />
                  <span className="w-2 h-2 bg-primary/40 rounded-full typing-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar — Ultra Premium with glow effect */}
      <div className="px-2.5 sm:px-4 pb-2.5 sm:pb-3 pt-2 shrink-0">
        <div className={`relative flex items-end gap-2 rounded-2xl px-3 sm:px-4 py-2.5 border-2 transition-all duration-300 ${
          inputFocused
            ? 'border-primary/30 shadow-[0_0_20px_-4px_var(--glow)]'
            : 'border-transparent hover:border-border/40'
        }`}
        style={{
          background: theme === 'dark'
            ? 'rgba(255,255,255,0.92)'
            : 'rgba(0,0,0,0.03)',
        }}
        >
          {/* Glow line on focus */}
          {inputFocused && (
            <div className="absolute top-0 left-[10%] right-[10%] h-[2px] bg-gradient-to-l from-transparent via-primary/40 to-transparent animate-fade-in" />
          )}
          <div className="flex items-center gap-0.5 shrink-0 pb-0.5">
            <button className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-95 group ${theme === 'dark' ? 'hover:bg-gray-200' : 'hover:bg-accent'}`} title="إرفاق ملف">
              <MaterialIcon icon="attach_file" size={19} className={`transition-colors ${theme === 'dark' ? 'text-gray-500 group-hover:text-gray-800' : 'text-muted-foreground group-hover:text-primary'}`} />
            </button>
            <button className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-95 hidden sm:flex group ${theme === 'dark' ? 'hover:bg-gray-200' : 'hover:bg-accent'}`} title="تسجيل صوتي">
              <MaterialIcon icon="mic" size={19} className={`transition-colors ${theme === 'dark' ? 'text-gray-500 group-hover:text-gray-800' : 'text-muted-foreground group-hover:text-primary'}`} />
            </button>
          </div>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="اكتب طلبك هنا... أو اسحب ملفاً"
            rows={1}
            className={`flex-1 bg-transparent text-[13px] sm:text-[14px] outline-none resize-none min-h-[32px] max-h-[120px] py-1.5 leading-relaxed ${theme === 'dark' ? 'text-gray-800 placeholder:text-gray-400' : 'text-foreground placeholder:text-muted-foreground/50'}`}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-300 shrink-0 mb-0.5 ${
              input.trim() && !isTyping
                ? theme === 'dark'
                  ? 'bg-[#0f2744] text-white hover:opacity-90 active:scale-90 shadow-md shadow-[#0f2744]/30'
                  : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-90 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30'
                : theme === 'dark'
                  ? 'bg-gray-200 text-gray-400'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            <MaterialIcon icon="arrow_upward" size={19} />
          </button>
        </div>
        <p className="text-[8px] sm:text-[9px] text-muted-foreground/40 text-center mt-1.5">
          منصة راصد الذكي — مكتب إدارة البيانات الوطنية
        </p>
      </div>

      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 bg-primary/5 rounded-2xl flex items-center justify-center z-10 pointer-events-none animate-fade-in">
          <div className="flex flex-col items-center gap-2 animate-bounce-in">
            <MaterialIcon icon="cloud_upload" size={36} className="text-primary" />
            <span className="text-[12px] font-medium text-primary">أفلت الملفات هنا لتحليلها</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== Setup Panel: Report ===== */
function SetupReportPanel({ onBack }: { onBack: () => void }) {
  const [selectedSections, setSelectedSections] = useState<string[]>(['cover', 'summary', 'results', 'recommendations']);
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggleSection = (id: string) => {
    setSelectedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleExecute = () => {
    setIsExecuting(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsExecuting(false);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 400);
  };

  return (
    <div className="p-3 sm:p-5 animate-morph-in">
      <div className="setup-panel p-4 sm:p-5 max-w-[560px] mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-success/10 flex items-center justify-center">
            <MaterialIcon icon="description" size={18} className="text-success" />
          </div>
          <div>
            <h3 className="text-[14px] sm:text-[15px] font-bold text-foreground">إنشاء تقرير</h3>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground">حدد أقسام التقرير المطلوبة</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground mb-2 block">أقسام التقرير</label>
          <div className="grid grid-cols-2 gap-1.5">
            {REPORT_SECTIONS.map((section, i) => (
              <button
                key={section.id}
                onClick={() => toggleSection(section.id)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[10px] sm:text-[11px] font-medium transition-all animate-stagger-in ${
                  selectedSections.includes(section.id)
                    ? 'border-primary/30 bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <MaterialIcon icon={section.icon} size={15} />
                {section.label}
              </button>
            ))}
          </div>
        </div>

        <SetupCommonOptions />

        {isExecuting ? (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <MaterialIcon icon="progress_activity" size={16} className="text-primary animate-icon-spin" />
              <span className="text-[11px] sm:text-[12px] font-medium text-foreground">جاري إنشاء التقرير...</span>
              <span className="text-[10px] sm:text-[11px] text-muted-foreground mr-auto">{Math.round(progress)}٪</span>
            </div>
            <div className="h-1.5 bg-accent rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <button
            onClick={handleExecute}
            className="w-full mt-4 h-9 sm:h-10 rounded-xl bg-primary text-primary-foreground text-[12px] sm:text-[13px] font-medium hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 btn-hover-lift"
          >
            <MaterialIcon icon="auto_awesome" size={17} />
            تنفيذ
          </button>
        )}
      </div>
    </div>
  );
}

/* ===== Setup Panel: Dashboard ===== */
function SetupDashboardPanel({ onBack }: { onBack: () => void }) {
  const widgets = [
    { id: 'cards', label: 'بطاقات مؤشرات', icon: 'credit_card' },
    { id: 'charts', label: 'رسوم بيانية', icon: 'bar_chart' },
    { id: 'tables', label: 'جداول', icon: 'table_chart' },
    { id: 'filters', label: 'فلاتر', icon: 'filter_list' },
    { id: 'map', label: 'خريطة', icon: 'map' },
    { id: 'timeline', label: 'خط زمني', icon: 'timeline' },
  ];
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>(['cards', 'charts', 'tables']);

  const toggleWidget = (id: string) => {
    setSelectedWidgets(prev =>
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
  };

  return (
    <div className="p-3 sm:p-5 animate-morph-in">
      <div className="setup-panel p-4 sm:p-5 max-w-[560px] mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-info/10 flex items-center justify-center">
            <MaterialIcon icon="dashboard" size={18} className="text-info" />
          </div>
          <div>
            <h3 className="text-[14px] sm:text-[15px] font-bold text-foreground">إنشاء لوحة مؤشرات</h3>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground">اختر العناصر المطلوبة في اللوحة</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground mb-2 block">عناصر اللوحة</label>
          <div className="grid grid-cols-3 gap-1.5">
            {widgets.map((w, i) => (
              <button
                key={w.id}
                onClick={() => toggleWidget(w.id)}
                className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-[10px] font-medium transition-all animate-stagger-in ${
                  selectedWidgets.includes(w.id)
                    ? 'border-primary/30 bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <MaterialIcon icon={w.icon} size={18} />
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <SetupCommonOptions />

        <button className="w-full mt-4 h-9 sm:h-10 rounded-xl bg-primary text-primary-foreground text-[12px] sm:text-[13px] font-medium hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 btn-hover-lift">
          <MaterialIcon icon="auto_awesome" size={17} />
          تنفيذ
        </button>
      </div>
    </div>
  );
}

/* ===== Setup Panel: Analysis ===== */
function SetupAnalysisPanel({ onBack }: { onBack: () => void }) {
  const [selectedType, setSelectedType] = useState<string>('compliance');

  return (
    <div className="p-3 sm:p-5 animate-morph-in">
      <div className="setup-panel p-4 sm:p-5 max-w-[560px] mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-warning/10 flex items-center justify-center">
            <MaterialIcon icon="analytics" size={18} className="text-warning" />
          </div>
          <div>
            <h3 className="text-[14px] sm:text-[15px] font-bold text-foreground">تحليل البيانات</h3>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground">اختر نوع التحليل المطلوب</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground mb-2 block">نوع التحليل</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {ANALYSIS_TYPES.map((type, i) => (
              <button
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[10px] sm:text-[11px] font-medium transition-all animate-stagger-in ${
                  selectedType === type.id
                    ? 'border-primary/30 bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <MaterialIcon icon={type.icon} size={15} />
                <div className="text-right">
                  <p className="font-medium">{type.label}</p>
                  <p className="text-[8px] sm:text-[9px] text-muted-foreground mt-0.5">{type.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <SetupCommonOptions />

        <button className="w-full mt-4 h-9 sm:h-10 rounded-xl bg-primary text-primary-foreground text-[12px] sm:text-[13px] font-medium hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 btn-hover-lift">
          <MaterialIcon icon="auto_awesome" size={17} />
          تنفيذ
        </button>
      </div>
    </div>
  );
}

/* ===== Common Setup Options ===== */
function SetupCommonOptions() {
  const [expanded, setExpanded] = useState(false);
  const options = [
    { key: 'contentAdherence', label: SETUP_COMMON.contentAdherence, icon: 'fact_check' },
    { key: 'officialIdentity', label: SETUP_COMMON.officialIdentity, icon: 'verified' },
    { key: 'contentSource', label: SETUP_COMMON.contentSource, icon: 'source' },
    { key: 'executionScope', label: SETUP_COMMON.executionScope, icon: 'tune' },
  ];

  return (
    <div className="border-t border-border pt-3 mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
      >
        <MaterialIcon icon={expanded ? 'expand_more' : 'chevron_left'} size={15} />
        {SETUP_COMMON.advancedOptions}
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5 animate-slide-in-bottom">
          {options.map(opt => (
            <div key={opt.key} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-accent/30 text-[10px] sm:text-[11px]">
              <MaterialIcon icon={opt.icon} size={14} className="text-muted-foreground" />
              <span className="text-foreground font-medium flex-1">{opt.label}</span>
              <select className="bg-transparent text-[9px] sm:text-[10px] text-muted-foreground outline-none border-none">
                <option>تلقائي</option>
                <option>مخصص</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===== Setup Panel: Presentation ===== */
function SetupPresentationPanel({ onBack }: { onBack: () => void }) {
  const templates = [
    { id: 'ndmo', label: 'قالب NDMO الرسمي', icon: 'verified' },
    { id: 'modern', label: 'عصري', icon: 'auto_awesome' },
    { id: 'minimal', label: 'بسيط', icon: 'remove' },
    { id: 'infographic', label: 'إنفوجرافيك', icon: 'insert_chart' },
  ];
  const [selectedTemplate, setSelectedTemplate] = useState('ndmo');
  const [slideCount, setSlideCount] = useState('10');

  return (
    <div className="p-3 sm:p-5 animate-morph-in">
      <div className="setup-panel p-4 sm:p-5 max-w-[560px] mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <MaterialIcon icon="slideshow" size={18} className="text-primary" />
          </div>
          <div>
            <h3 className="text-[14px] sm:text-[15px] font-bold text-foreground">إنشاء عرض تقديمي</h3>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground">حدد القالب وعدد الشرائح</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground mb-2 block">القالب</label>
          <div className="grid grid-cols-2 gap-1.5">
            {templates.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplate(t.id)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[10px] sm:text-[11px] font-medium transition-all animate-stagger-in ${
                  selectedTemplate === t.id
                    ? 'border-primary/30 bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <MaterialIcon icon={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground mb-2 block">عدد الشرائح</label>
          <input
            type="number"
            value={slideCount}
            onChange={e => setSlideCount(e.target.value)}
            className="w-full h-8 px-3 rounded-lg border border-border bg-background text-[11px] text-foreground outline-none focus:border-primary/30"
            min="3"
            max="50"
          />
        </div>

        <SetupCommonOptions />

        <button className="w-full mt-4 h-9 sm:h-10 rounded-xl bg-primary text-primary-foreground text-[12px] sm:text-[13px] font-medium hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 btn-hover-lift">
          <MaterialIcon icon="auto_awesome" size={17} />
          تنفيذ
        </button>
      </div>
    </div>
  );
}

/* ===== Setup Panel: Matching ===== */
function SetupMatchingPanel({ onBack }: { onBack: () => void }) {
  const matchTypes = [
    { id: 'schema', label: 'مطابقة المخططات', icon: 'schema', desc: 'مقارنة هياكل البيانات' },
    { id: 'data', label: 'مطابقة البيانات', icon: 'compare', desc: 'مقارنة القيم والسجلات' },
    { id: 'standard', label: 'مطابقة المعايير', icon: 'verified', desc: 'التحقق من الامتثال' },
    { id: 'convert', label: 'تحويل الصيغ', icon: 'transform', desc: 'تحويل بين الصيغ' },
  ];
  const [selectedType, setSelectedType] = useState('schema');

  return (
    <div className="p-3 sm:p-5 animate-morph-in">
      <div className="setup-panel p-4 sm:p-5 max-w-[560px] mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
            <MaterialIcon icon="compare_arrows" size={18} className="text-destructive" />
          </div>
          <div>
            <h3 className="text-[14px] sm:text-[15px] font-bold text-foreground">المطابقة والتحويل</h3>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground">اختر نوع العملية</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {matchTypes.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setSelectedType(t.id)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[10px] sm:text-[11px] font-medium transition-all animate-stagger-in ${
                  selectedType === t.id
                    ? 'border-primary/30 bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <MaterialIcon icon={t.icon} size={15} />
                <div className="text-right">
                  <p className="font-medium">{t.label}</p>
                  <p className="text-[8px] text-muted-foreground">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <SetupCommonOptions />

        <button className="w-full mt-4 h-9 sm:h-10 rounded-xl bg-primary text-primary-foreground text-[12px] sm:text-[13px] font-medium hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 btn-hover-lift">
          <MaterialIcon icon="auto_awesome" size={17} />
          تنفيذ
        </button>
      </div>
    </div>
  );
}

/* ===== Setup Panel: Arabization ===== */
function SetupArabizationPanel({ onBack }: { onBack: () => void }) {
  const arabTypes = [
    { id: 'terms', label: 'تعريب مصطلحات', icon: 'translate', desc: 'ترجمة المصطلحات التقنية' },
    { id: 'ui', label: 'تعريب واجهات', icon: 'web', desc: 'تعريب عناصر الواجهة' },
    { id: 'docs', label: 'تعريب وثائق', icon: 'description', desc: 'تعريب المستندات الكاملة' },
    { id: 'data', label: 'تعريب بيانات', icon: 'database', desc: 'تعريب قيم البيانات' },
  ];
  const [selectedType, setSelectedType] = useState('terms');

  return (
    <div className="p-3 sm:p-5 animate-morph-in">
      <div className="setup-panel p-4 sm:p-5 max-w-[560px] mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-info/10 flex items-center justify-center">
            <MaterialIcon icon="g_translate" size={18} className="text-info" />
          </div>
          <div>
            <h3 className="text-[14px] sm:text-[15px] font-bold text-foreground">التعريب</h3>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground">تعريب المحتوى والمصطلحات</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {arabTypes.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setSelectedType(t.id)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[10px] sm:text-[11px] font-medium transition-all animate-stagger-in ${
                  selectedType === t.id
                    ? 'border-primary/30 bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <MaterialIcon icon={t.icon} size={15} />
                <div className="text-right">
                  <p className="font-medium">{t.label}</p>
                  <p className="text-[8px] text-muted-foreground">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <SetupCommonOptions />

        <button className="w-full mt-4 h-9 sm:h-10 rounded-xl bg-primary text-primary-foreground text-[12px] sm:text-[13px] font-medium hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 btn-hover-lift">
          <MaterialIcon icon="auto_awesome" size={17} />
          تنفيذ
        </button>
      </div>
    </div>
  );
}

/* ===== Setup Panel: Extraction ===== */
function SetupExtractionPanel({ onBack }: { onBack: () => void }) {
  const extractionTypes = [
    { id: 'audio', label: 'تفريغ صوتي', icon: 'mic', desc: 'تحويل الصوت إلى نص' },
    { id: 'image', label: 'استخراج من صور', icon: 'image', desc: 'OCR واستخراج النصوص' },
    { id: 'pdf', label: 'استخراج من PDF', icon: 'picture_as_pdf', desc: 'استخراج محتوى PDF' },
    { id: 'table', label: 'استخراج جداول', icon: 'table_chart', desc: 'استخراج الجداول من الملفات' },
  ];
  const [selectedType, setSelectedType] = useState('audio');

  return (
    <div className="p-3 sm:p-5 animate-morph-in">
      <div className="setup-panel p-4 sm:p-5 max-w-[560px] mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gold/10 flex items-center justify-center">
            <MaterialIcon icon="text_snippet" size={18} className="text-gold" />
          </div>
          <div>
            <h3 className="text-[14px] sm:text-[15px] font-bold text-foreground">التفريغ والاستخراج</h3>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground">تحويل الوسائط إلى نصوص</p>
          </div>
        </div>

        {/* Upload zone */}
        <div className="mb-4 border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/30 hover:bg-primary/3 transition-all cursor-pointer">
          <MaterialIcon icon="upload_file" size={28} className="text-muted-foreground/30 mx-auto mb-1" />
          <p className="text-[11px] font-medium text-foreground">ارفع الملف المراد تفريغه</p>
          <p className="text-[9px] text-muted-foreground">MP3, WAV, MP4, صور, PDF</p>
        </div>

        <div className="mb-4">
          <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground mb-2 block">نوع الاستخراج</label>
          <div className="grid grid-cols-2 gap-1.5">
            {extractionTypes.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setSelectedType(t.id)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[10px] sm:text-[11px] font-medium transition-all animate-stagger-in ${
                  selectedType === t.id
                    ? 'border-primary/30 bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
                style={{ animationDelay: `${i * 0.03}s` }}
              >
                <MaterialIcon icon={t.icon} size={14} />
                <div className="text-right">
                  <p className="font-medium">{t.label}</p>
                  <p className="text-[8px] text-muted-foreground">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <SetupCommonOptions />

        <button className="w-full mt-4 h-9 sm:h-10 rounded-xl bg-primary text-primary-foreground text-[12px] sm:text-[13px] font-medium hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 btn-hover-lift">
          <MaterialIcon icon="auto_awesome" size={17} />
          تنفيذ
        </button>
      </div>
    </div>
  );
}

/* ===== Setup Panel: Translation ===== */
function SetupTranslationPanel({ onBack }: { onBack: () => void }) {
  const languages = [
    { id: 'en', label: 'الإنجليزية', flag: '🇬🇧' },
    { id: 'fr', label: 'الفرنسية', flag: '🇫🇷' },
    { id: 'es', label: 'الإسبانية', flag: '🇪🇸' },
    { id: 'zh', label: 'الصينية', flag: '🇨🇳' },
    { id: 'de', label: 'الألمانية', flag: '🇩🇪' },
    { id: 'ja', label: 'اليابانية', flag: '🇯🇵' },
  ];
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('ar');

  return (
    <div className="p-3 sm:p-5 animate-morph-in">
      <div className="setup-panel p-4 sm:p-5 max-w-[560px] mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-warning/10 flex items-center justify-center">
            <MaterialIcon icon="translate" size={18} className="text-warning" />
          </div>
          <div>
            <h3 className="text-[14px] sm:text-[15px] font-bold text-foreground">الترجمة</h3>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground">ترجمة المحتوى بين اللغات</p>
          </div>
        </div>

        {/* Upload zone */}
        <div className="mb-4 border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/30 hover:bg-primary/3 transition-all cursor-pointer">
          <MaterialIcon icon="upload_file" size={28} className="text-muted-foreground/30 mx-auto mb-1" />
          <p className="text-[11px] font-medium text-foreground">ارفع الملف المراد ترجمته</p>
          <p className="text-[9px] text-muted-foreground">أو اكتب النص مباشرة في المحادثة</p>
        </div>

        <div className="mb-4">
          <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground mb-2 block">من</label>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {languages.map((l, i) => (
              <button
                key={l.id}
                onClick={() => setSourceLang(l.id)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-all ${
                  sourceLang === l.id
                    ? 'border-primary/30 bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                <span className="text-[12px]">{l.flag}</span>
                {l.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center my-2">
            <MaterialIcon icon="swap_vert" size={20} className="text-primary" />
          </div>

          <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground mb-2 block">إلى</label>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
            <span className="text-[14px]">🇸🇦</span>
            <span className="text-[11px] font-medium text-primary">العربية</span>
            <MaterialIcon icon="check_circle" size={14} className="mr-auto text-primary" />
          </div>
        </div>

        <SetupCommonOptions />

        <button className="w-full mt-4 h-9 sm:h-10 rounded-xl bg-primary text-primary-foreground text-[12px] sm:text-[13px] font-medium hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 btn-hover-lift">
          <MaterialIcon icon="auto_awesome" size={17} />
          تنفيذ
        </button>
      </div>
    </div>
  );
}
