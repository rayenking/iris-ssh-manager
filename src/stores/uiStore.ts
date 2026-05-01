import { create } from 'zustand';

type Theme = 'dark-minimal' | 'iris-pink';

interface UiState {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  snippetsOpen: boolean;
  explorerOpen: boolean;
  importDialogOpen: boolean;
  settingsOpen: boolean;
  currentTheme: Theme;
  errorToast: string | null;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleCommandPalette: () => void;
  toggleSnippets: () => void;
  toggleExplorer: () => void;
  setExplorerOpen: (open: boolean) => void;
  setImportDialogOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  showErrorToast: (message: string) => void;
  clearErrorToast: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  snippetsOpen: false,
  explorerOpen: false,
  importDialogOpen: false,
  settingsOpen: false,
  currentTheme: 'dark-minimal',
  errorToast: null,

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  toggleSnippets: () => set((state) => ({ snippetsOpen: !state.snippetsOpen })),

  toggleExplorer: () => set((state) => ({ explorerOpen: !state.explorerOpen })),

  setExplorerOpen: (open) => set({ explorerOpen: open }),

  setImportDialogOpen: (open) => set({ importDialogOpen: open }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),
  
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
