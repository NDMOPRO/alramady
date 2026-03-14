/*
 * Chat Panel - Center panel in NotebookLM Canvas
 * Exact specs from original:
 * - Flexible width, white bg, border-radius: 16px
 * - Header: 48px height, font-size: 16px, font-weight: 400, border-bottom: 1px solid #DDE1EB
 * - Only more_vert button on right → opens "Delete chat history" menu
 * - Empty state: 📔 emoji + "Untitled notebook" + "0 sources"
 * - Chat messages area with AI responses
 * - Omnibar: 50px height, 16px border-radius, transparent bg, 1px solid #dde1eb border
 * - Send button: 32px circle, bg: #EBEBEB, arrow_forward icon
 * - Disclaimer: below omnibar, 11px text
 */

import { useState, useRef, useEffect } from 'react';
import MaterialIcon from './MaterialIcon';
import DropdownMenu from './DropdownMenu';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatPanelProps {
  notebookTitle: string;
  sourceCount: number;
}

export default function ChatPanel({ notebookTitle, sourceCount }: ChatPanelProps) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const chatMenuRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setMessage('');
    setIsTyping(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Simulate AI response
    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I'd be happy to help with that! However, you'll need to add some sources to your notebook first. Once you upload PDFs, websites, or other documents, I can analyze them and answer your questions based on the content.\n\nTo get started:\n1. Click "Add sources" in the Sources panel\n2. Upload your documents or paste URLs\n3. Then ask me anything about your sources!`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDeleteHistory = () => {
    setMessages([]);
    setChatMenuOpen(false);
  };

  const handleTextareaInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

  const chatMenuItems = [
    {
      icon: 'delete',
      label: 'Delete chat history',
      sublabel: 'Chat history is private to you.',
    },
  ];

  return (
    <section className="flex-1 flex flex-col bg-white overflow-hidden min-w-0" style={{ borderRadius: 16 }}>
      {/* Panel Header - 48px, font 16px weight 400 */}
      <div className="flex items-center justify-between px-4 shrink-0" style={{ height: 48, borderBottom: '1px solid #dde1eb' }}>
        <span className="text-[16px] font-normal text-[#1b1b1c]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          Chat
        </span>
        <div className="relative">
          <button
            ref={chatMenuRef}
            onClick={() => setChatMenuOpen(!chatMenuOpen)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
            title="Chat options"
          >
            <MaterialIcon icon="more_vert" size={18} className="text-[#444746]" />
          </button>
          <DropdownMenu
            isOpen={chatMenuOpen}
            onClose={() => setChatMenuOpen(false)}
            items={chatMenuItems}
            anchorRef={chatMenuRef}
          />
        </div>
      </div>

      {/* Chat Content */}
      <div className="flex-1 flex flex-col overflow-y-auto px-4">
        {messages.length === 0 ? (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <span className="text-[48px] mb-3 leading-none">📔</span>
            <h2 className="text-[22px] font-normal text-[#303030] mb-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>
              {notebookTitle}
            </h2>
            <p className="text-[14px] text-[#5f6368]" style={{ fontFamily: "'Google Sans Text', sans-serif" }}>
              {sourceCount} sources
            </p>
          </div>
        ) : (
          /* Messages */
          <div className="flex-1 py-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-4 py-3 text-[14px] leading-6 ${
                    msg.role === 'user'
                      ? 'bg-[#e8f0fe] text-[#303030]'
                      : 'bg-[#f8f9fa] text-[#303030]'
                  }`}
                  style={{
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    fontFamily: "'Google Sans Text', sans-serif",
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-[#f8f9fa] px-4 py-3 flex items-center gap-1" style={{ borderRadius: '18px 18px 18px 4px' }}>
                  <span className="w-2 h-2 bg-[#5f6368] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-[#5f6368] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-[#5f6368] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Omnibar - Chat Input Container: 50px height, 16px border-radius */}
      <div className="px-4 pb-1.5">
        <div className="flex items-end px-4" style={{ minHeight: 50, borderRadius: 16, border: '1px solid #dde1eb' }}>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              handleTextareaInput();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Start typing…"
            className="flex-1 text-[14px] text-[#303030] placeholder-[#5f6368] bg-transparent border-none outline-none resize-none leading-5"
            rows={1}
            style={{ fontFamily: "'Google Sans Text', sans-serif", paddingTop: 14, paddingBottom: 14, maxHeight: 120 }}
          />
          <div className="flex items-center gap-3 ml-2 shrink-0 pb-[9px]">
            <span className="text-[12px] text-[#303030] whitespace-nowrap" style={{ fontFamily: "'Google Sans Text', sans-serif" }}>
              {sourceCount} sources
            </span>
            {/* Send button: 32px, bg #EBEBEB, pill, icon=arrow_forward */}
            <button
              onClick={handleSend}
              className="flex items-center justify-center rounded-full transition-colors"
              style={{
                width: 32,
                height: 32,
                backgroundColor: message.trim() ? '#000' : '#ebebeb',
              }}
            >
              <MaterialIcon icon="arrow_forward" size={18} className={message.trim() ? 'text-white' : 'text-[#bdc1c6]'} />
            </button>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="text-center pb-2.5 pt-1 px-4">
        <p className="text-[11px] text-[#9aa0a6]" style={{ fontFamily: "'Google Sans Text', sans-serif" }}>
          NotebookLM can be inaccurate; please double-check its responses.
        </p>
      </div>
    </section>
  );
}
