import { create } from 'zustand';

type Theme = 'dark-minimal' | 'iris-pink';

const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 420;
const MAX_REVIEW_DIFF_WIDTH = 1000;

function clampPanelWidth(width: number) {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
}

function clampReviewDiffWidth(width: number) {
  return Math.min(MAX_REVIEW_DIFF_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
}

interface EditorFile {
  path: string;
  sessionId?: string;
  isLocal: boolean;
}

interface ReviewDiffPanelFile {
  path: string;
  repoRoot: string;
}

interface UiState {
  commandPaletteOpen: boolean;
  snippetsOpen: boolean;
  explorerOpen: boolean;
  codeReviewOpen: boolean;
  codeReviewSourceTabId: string | null;
  snippetsWidth: number;
  explorerWidth: number;
  codeReviewWidth: number;
  reviewDiffWidth: number;
  importDialogOpen: boolean;
  settingsOpen: boolean;
  currentTheme: Theme;
  errorToast: string | null;
  editorFile: EditorFile | null;
  reviewDiffFile: ReviewDiffPanelFile | null;

  toggleCommandPalette: () => void;
  toggleSnippets: () => void;
  toggleExplorer: () => void;
  toggleCodeReview: () => void;
  setExplorerOpen: (open: boolean) => void;
  setCodeReviewOpen: (open: boolean) => void;
  setCodeReviewSourceTabId: (tabId: string | null) => void;
  setSnippetsWidth: (width: number) => void;
  setExplorerWidth: (width: number) => void;
  setCodeReviewWidth: (width: number) => void;
  setReviewDiffWidth: (width: number) => void;
  setImportDialogOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  setEditorFile: (file: EditorFile | null) => void;
  setReviewDiffFile: (file: ReviewDiffPanelFile | null) => void;
  showErrorToast: (message: string) => void;
  clearErrorToast: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  commandPaletteOpen: false,
  snippetsOpen: false,
  explorerOpen: false,
  codeReviewOpen: false,
  codeReviewSourceTabId: null,
  snippetsWidth: 320,
  explorerWidth: 300,
  codeReviewWidth: 320,
  reviewDiffWidth: 520,
  importDialogOpen: false,
  settingsOpen: false,
  currentTheme: 'dark-minimal',
  errorToast: null,
  editorFile: null,
  reviewDiffFile: null,

  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  toggleSnippets: () => set((state) => ({
    snippetsOpen: !state.snippetsOpen,
    explorerOpen: false,
    codeReviewOpen: false,
  })),

  toggleExplorer: () => set((state) => ({
    explorerOpen: !state.explorerOpen,
    snippetsOpen: false,
    codeReviewOpen: false,
  })),

  toggleCodeReview: () => set((state) => ({
    codeReviewOpen: !state.codeReviewOpen,
    explorerOpen: false,
    snippetsOpen: false,
    reviewDiffFile: !state.codeReviewOpen ? null : state.reviewDiffFile,
  })),

  setExplorerOpen: (open) => set({ explorerOpen: open }),

  setCodeReviewOpen: (open) => set((state) => ({
    codeReviewOpen: open,
    explorerOpen: open ? false : state.explorerOpen,
    snippetsOpen: open ? false : state.snippetsOpen,
    reviewDiffFile: open ? null : state.reviewDiffFile,
  })),

  setCodeReviewSourceTabId: (tabId) => set({ codeReviewSourceTabId: tabId }),

  setSnippetsWidth: (width) => set({ snippetsWidth: clampPanelWidth(width) }),

  setExplorerWidth: (width) => set({ explorerWidth: clampPanelWidth(width) }),

  setCodeReviewWidth: (width) => set({ codeReviewWidth: clampPanelWidth(width) }),

  setReviewDiffWidth: (width) => set({ reviewDiffWidth: clampReviewDiffWidth(width) }),

  setImportDialogOpen: (open) => set({ importDialogOpen: open }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setEditorFile: (file) => set((state) => ({
    editorFile: file,
    reviewDiffFile: file ? null : state.reviewDiffFile,
  })),

  setReviewDiffFile: (file) => set((state) => ({
    reviewDiffFile: file,
    editorFile: file ? null : state.editorFile,
  })),

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
