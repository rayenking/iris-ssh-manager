import { create } from 'zustand';

type Theme = 'dark-minimal' | 'iris-pink';

interface UiState {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  snippetsOpen: boolean;
  currentTheme: Theme;
  errorToast: string | null;

  toggleSidebar: () => void;
  toggleCommandPalette: () => void;
  toggleSnippets: () => void;
  setTheme: (theme: Theme) => void;
  showErrorToast: (message: string) => void;
  clearErrorToast: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  snippetsOpen: false,
  currentTheme: 'dark-minimal',
  errorToast: null,

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  toggleSnippets: () => set((state) => ({ snippetsOpen: !state.snippetsOpen })),
  
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    set({ currentTheme: theme });
  },

  showErrorToast: (message) => {
    set({ errorToast: message });
    setTimeout(() => {
      set({ errorToast: null });
    }, 5000);
  },

  clearErrorToast: () => set({ errorToast: null }),
}));
