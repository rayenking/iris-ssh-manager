import { create } from 'zustand';
import { tauriApi } from '../lib/tauri';
import { useUiStore } from './uiStore';
import {
  getDefaultBindings,
  resetAllShortcutCombos,
  resetShortcutCombo,
  updateShortcutCombo,
} from '../lib/keybindings';

export type Theme = 'dark-minimal' | 'iris-pink';
export type SidebarDefaultState = 'expanded' | 'collapsed';
export type CursorStyle = 'block' | 'underline' | 'bar';
export type BellStyle = 'none' | 'visual' | 'audio';

interface AppearanceSettings {
  theme: Theme;
  uiFontSize: number;
  sidebarDefaultState: SidebarDefaultState;
}

interface TerminalSettings {
  terminalFont: string;
  terminalFontSize: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  scrollbackBuffer: number;
  bell: BellStyle;
  autoReconnect: boolean;
}

interface SettingsState {
  keybindings: Record<string, string>;
  theme: Theme;
  uiFontSize: number;
  sidebarDefaultState: SidebarDefaultState;
  terminalFont: string;
  terminalFontSize: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  scrollbackBuffer: number;
  bell: BellStyle;
  autoReconnect: boolean;
  settingsLoaded: boolean;

  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  saveAppearanceSettings: (settings: Partial<AppearanceSettings>) => void;
  saveTerminalSettings: (settings: Partial<TerminalSettings>) => void;
  updateKeybinding: (action: string, combo: string) => void;
  resetKeybinding: (action: string) => void;
  resetKeybindingsToDefaults: () => void;
  setTheme: (theme: Theme) => void;
  setUiFontSize: (uiFontSize: number) => void;
  setSidebarDefaultState: (sidebarDefaultState: SidebarDefaultState) => void;
  updateTerminalSettings: (settings: Partial<TerminalSettings>) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debounceSave(save: () => void) {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(() => {
    saveTimer = null;
    save();
  }, 500);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  keybindings: getDefaultBindings(),
  theme: 'dark-minimal',
  uiFontSize: 14,
  sidebarDefaultState: 'expanded',
  terminalFont: 'monospace',
  terminalFontSize: 14,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollbackBuffer: 5000,
  bell: 'visual',
  autoReconnect: true,
  settingsLoaded: false,

  loadSettings: async () => {
    try {
      const allSettings = await tauriApi.getAllSettings();
      const keybindings: Record<string, string> = allSettings['keybindings']
        ? JSON.parse(allSettings['keybindings'] as string) as Record<string, string>
        : getDefaultBindings();
      const theme = allSettings['theme'] === 'iris-pink' ? 'iris-pink' : 'dark-minimal';
      const uiFontSize = allSettings['uiFontSize'] ? parseInt(allSettings['uiFontSize'], 10) : 14;
      const sidebarDefaultState = allSettings['sidebarDefaultState'] === 'collapsed' ? 'collapsed' : 'expanded';

      const terminalFont = allSettings['terminalFont'] || 'monospace';
      const terminalFontSize = allSettings['terminalFontSize'] ? parseInt(allSettings['terminalFontSize'], 10) : 14;
      const cursorStyle = (allSettings['cursorStyle'] as CursorStyle) || 'block';
      const cursorBlink = allSettings['cursorBlink'] ? allSettings['cursorBlink'] === 'true' : true;
      const scrollbackBuffer = allSettings['scrollbackBuffer'] ? parseInt(allSettings['scrollbackBuffer'], 10) : 5000;
      const bell = (allSettings['bell'] as BellStyle) || 'visual';
      const autoReconnect = allSettings['autoReconnect'] ? allSettings['autoReconnect'] === 'true' : true;

      Object.entries(keybindings).forEach(([action, combo]) => updateShortcutCombo(action, combo));

      set({
        keybindings,
        theme,
        uiFontSize,
        sidebarDefaultState,
        terminalFont,
        terminalFontSize,
        cursorStyle,
        cursorBlink,
        scrollbackBuffer,
        bell,
        autoReconnect,
        settingsLoaded: true,
      });

      useUiStore.getState().setTheme(theme);
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ settingsLoaded: true });
    }
  },

  saveSettings: async () => {
    const state = get();

    try {
      await tauriApi.setSetting('keybindings', JSON.stringify(state.keybindings));
      await tauriApi.setSetting('theme', state.theme);
      await tauriApi.setSetting('uiFontSize', state.uiFontSize.toString());
      await tauriApi.setSetting('sidebarDefaultState', state.sidebarDefaultState);
      await tauriApi.setSetting('terminalFont', state.terminalFont);
      await tauriApi.setSetting('terminalFontSize', state.terminalFontSize.toString());
      await tauriApi.setSetting('cursorStyle', state.cursorStyle);
      await tauriApi.setSetting('cursorBlink', state.cursorBlink.toString());
      await tauriApi.setSetting('scrollbackBuffer', state.scrollbackBuffer.toString());
      await tauriApi.setSetting('bell', state.bell);
      await tauriApi.setSetting('autoReconnect', state.autoReconnect.toString());
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },

  saveAppearanceSettings: (settings) => {
    set((state) => ({ ...state, ...settings }));
    debounceSave(() => get().saveSettings());
  },

  saveTerminalSettings: (settings) => {
    set((state) => ({ ...state, ...settings }));
    debounceSave(() => get().saveSettings());
  },

  updateKeybinding: (action: string, combo: string) => {
    set((state) => {
      const keybindings = { ...state.keybindings, [action]: combo };
      updateShortcutCombo(action, combo);
      return { keybindings };
    });
    debounceSave(() => get().saveSettings());
  },

  resetKeybinding: (action: string) => {
    const defaults = getDefaultBindings();
    const defaultCombo = defaults[action];

    if (!defaultCombo) {
      return;
    }

    resetShortcutCombo(action);
    set((state) => ({
      keybindings: {
        ...state.keybindings,
        [action]: defaultCombo,
      },
    }));
    debounceSave(() => get().saveSettings());
  },

  resetKeybindingsToDefaults: () => {
    const defaults = getDefaultBindings();
    resetAllShortcutCombos();
    set({ keybindings: defaults });
    debounceSave(() => get().saveSettings());
  },

  setTheme: (theme: Theme) => {
    set({ theme });
    useUiStore.getState().setTheme(theme);
    debounceSave(() => get().saveSettings());
  },

  setUiFontSize: (uiFontSize: number) => {
    set({ uiFontSize });
    debounceSave(() => get().saveSettings());
  },

  setSidebarDefaultState: (sidebarDefaultState: SidebarDefaultState) => {
    set({ sidebarDefaultState });
    debounceSave(() => get().saveSettings());
  },

  updateTerminalSettings: (settings: Partial<TerminalSettings>) => {
    set((state) => ({ ...state, ...settings }));
    debounceSave(() => get().saveSettings());
  },
}));
