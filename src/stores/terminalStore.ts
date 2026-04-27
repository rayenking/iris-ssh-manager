import { create } from 'zustand';
import type { TerminalTab } from '../types/terminal';
import type { TabStatus } from '../types/terminal';

interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  
  openTab: (connectionId: string, title: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  updateTabStatus: (id: string, status: TabStatus) => void;
  setTabSessionId: (id: string, sessionId?: string) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  tabs: [],
  activeTabId: null,

  openTab: (connectionId, title) => {
    const newTab: TerminalTab = {
      id: crypto.randomUUID(),
      connectionId,
      title,
      status: 'connecting',
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id
    }));
  },

  closeTab: (id) => {
    set((state) => {
      const newTabs = state.tabs.filter(t => t.id !== id);
      
      let newActiveId = state.activeTabId;
      if (state.activeTabId === id) {
        newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
      }

      return {
        tabs: newTabs,
        activeTabId: newActiveId
      };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabStatus: (id, status) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, status } : tab)),
    }));
  },

  setTabSessionId: (id, sessionId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, sessionId } : tab)),
    }));
  },

  reorderTabs: (fromIndex, toIndex) => {
    set((state) => {
      const newTabs = [...state.tabs];
      const [movedTab] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, movedTab);
      return { tabs: newTabs };
    });
  }
}));
