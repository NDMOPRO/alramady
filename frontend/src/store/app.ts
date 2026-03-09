import { create } from 'zustand';

export type Locale = 'ar' | 'en';
export type Theme = 'light' | 'dark';

interface AppState {
  sidebarOpen: boolean;
  activeEngine: string | null;
  locale: Locale;
  theme: Theme;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveEngine: (engine: string | null) => void;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  activeEngine: null,
  locale: 'ar',
  theme: 'light',

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActiveEngine: (engine) => set({ activeEngine: engine }),
  setLocale: (locale) => set({ locale }),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
    set({ theme });
  },
}));
