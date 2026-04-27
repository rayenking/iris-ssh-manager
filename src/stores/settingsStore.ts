import { create } from 'zustand';
import { tauriApi } from '../lib/tauri';
import { getDefaultBindings, updateShortcutCombo } from '../lib/keybindings';

interface TerminalSettings {
  terminalFont: string;
  terminalFontSize: number;
  cursorStyle: string;
}

interface SettingsState {
  keybindings: Record<string, string>;
  terminalFont: string;
  terminalFontSize: number;
  cursorStyle: string;

  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  updateKeybinding: (action: string, combo: string) => void;
  updateTerminalSettings: (settings: Partial<TerminalSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  keybindings: getDefaultBindings(),
  terminalFont: 'monospace',
  terminalFontSize: 14,
  cursorStyle: 'block',

  loadSettings: async () => {
    try {
      const allSettings = await tauriApi.getAllSettings();
      
      const keybindings = allSettings['keybindings'] 
        ? JSON.parse(allSettings['keybindings']) 
        : getDefaultBindings();
      
      set({
        keybindings,
        terminalFont: allSettings['terminalFont'] || 'monospace',
        terminalFontSize: allSettings['terminalFontSize'] ? parseInt(allSettings['terminalFontSize'], 10) : 14,
        cursorStyle: allSettings['cursorStyle'] || 'block',
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  saveSettings: async () => {
    const state = get();
    try {
      await tauriApi.setSetting('keybindings', JSON.stringify(state.keybindings));
      await tauriApi.setSetting('terminalFont', state.terminalFont);
      await tauriApi.setSetting('terminalFontSize', state.terminalFontSize.toString());
      await tauriApi.setSetting('cursorStyle', state.cursorStyle);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },

  updateKeybinding: (action: string, combo: string) => {
    set((state) => {
      const newBindings = { ...state.keybindings, [action]: combo };
      updateShortcutCombo(action, combo);
      return { keybindings: newBindings };
    });
    get().saveSettings();
  },

  updateTerminalSettings: (settings: Partial<TerminalSettings>) => {
    set((state) => ({ ...state, ...settings }));
    get().saveSettings();
  },
}));
