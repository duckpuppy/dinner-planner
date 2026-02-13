import { create } from 'zustand';
import { users } from '@/lib/api';
import { useAuthStore } from './auth';

interface ThemeState {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  initTheme: (userTheme?: 'light' | 'dark') => void;
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('theme', theme);
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'light',

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });

    // Persist to API (fire and forget)
    const user = useAuthStore.getState().user;
    if (user) {
      users.updatePreferences(user.id, { theme }).catch(() => {});
    }
  },

  initTheme: (userTheme) => {
    const theme = userTheme ?? (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light';
    applyTheme(theme);
    set({ theme });
  },
}));
