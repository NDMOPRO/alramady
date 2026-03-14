import { useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvas-store';

const STORAGE_KEYS = {
  theme: 'rasid-canvas-theme',
  sidebarState: 'rasid-canvas-sidebar',
  chatHistory: 'rasid-canvas-history',
} as const;

// GP-0501: Persist user preferences across sessions
export function usePersistence() {
  const theme = useCanvasStore((s) => s.theme);
  const messages = useCanvasStore((s) => s.messages);

  // Restore theme on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    if (saved === 'dark' || saved === 'light') {
      const store = useCanvasStore.getState();
      if (store.theme !== saved) {
        document.documentElement.classList.toggle('dark', saved === 'dark');
        useCanvasStore.setState({ theme: saved });
      }
    }
  }, []);

  // Persist theme changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  }, [theme]);

  // Persist recent chat history (last 50 messages, debounced)
  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => {
      const recent = messages.slice(-50).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        cards: m.cards?.map((c) => ({
          id: c.id,
          type: c.type,
        })),
      }));
      localStorage.setItem(STORAGE_KEYS.chatHistory, JSON.stringify(recent));
    }, 1000);
    return () => clearTimeout(timer);
  }, [messages]);
}

export function clearPersistedData() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}
