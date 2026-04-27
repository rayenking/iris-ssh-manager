import { create } from 'zustand';

type Theme = 'dark-minimal' | 'iris-pink';

interface UiState {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  currentTheme: Theme;
  errorToast: string | null;

  toggleSidebar: () => void;
  toggleCommandPalette: () => void;
  setTheme: (theme: Theme) => void;
  showErrorToast: (message: string) => void;
  clearErrorToast: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  currentTheme: 'dark-minimal',
  errorToast: null,

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  
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
