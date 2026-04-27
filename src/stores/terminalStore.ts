import { create } from 'zustand';
import type { AppTab, TabStatus, TerminalTab } from '../types/terminal';
import { getPrimaryPaneId, useSplitStore } from './splitStore';

interface TerminalState {
  tabs: AppTab[];
  activeTabId: string | null;

  openTab: (connectionId: string, title: string) => void;
  openFileBrowserTab: (terminalTabId: string, connectionId: string, title: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  updateTabStatus: (id: string, status: TabStatus) => void;
  setTabSessionId: (id: string, sessionId?: string) => void;
}

function isTerminalTab(tab: AppTab): tab is TerminalTab {
  return tab.kind === 'terminal';
}

export const useTerminalStore = create<TerminalState>((set) => ({
  tabs: [],
  activeTabId: null,

  openTab: (connectionId, title) => {
    const newTab: TerminalTab = {
      id: crypto.randomUUID(),
      connectionId,
      title,
      kind: 'terminal',
      status: 'connecting',
    };

    useSplitStore.getState().initSplit(newTab.id, connectionId);
    useSplitStore.getState().setFocusedPane(newTab.id);

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
  },

  openFileBrowserTab: (terminalTabId, connectionId, title) => {
    set((state) => {
      const existingTab = state.tabs.find(
        (tab) => tab.kind === 'files' && tab.terminalTabId === terminalTabId,
      );

      if (existingTab) {
        return { activeTabId: existingTab.id };
      }

      const newTab = {
        id: crypto.randomUUID(),
        connectionId,
        title: `${title} Files`,
        kind: 'files' as const,
        terminalTabId,
      };

      return {
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      };
    });
  },

  closeTab: (id) => {
    set((state) => {
      const targetTab = state.tabs.find((tab) => tab.id === id);
      const tabsToRemove = new Set<string>([id]);
      const splitStore = useSplitStore.getState();

      if (targetTab?.kind === 'terminal') {
        splitStore.removeSplit(id);

        state.tabs.forEach((tab) => {
          if (tab.kind === 'files' && tab.terminalTabId === id) {
            tabsToRemove.add(tab.id);
          }
        });
      }

      const newTabs = state.tabs.filter((tab) => !tabsToRemove.has(tab.id));
      const activeTabRemoved = state.activeTabId ? tabsToRemove.has(state.activeTabId) : false;
      const nextActiveTabId = activeTabRemoved
        ? newTabs.length > 0
          ? newTabs[newTabs.length - 1].id
          : null
        : state.activeTabId;

      if (nextActiveTabId) {
        const nextActiveTab = newTabs.find((tab) => tab.id === nextActiveTabId);

        if (nextActiveTab?.kind === 'terminal') {
          const nextTree = splitStore.getSplitTree(nextActiveTab.id);
          splitStore.setFocusedPane(nextTree ? getPrimaryPaneId(nextTree) : nextActiveTab.id);
        }
      }

      return {
        tabs: newTabs,
        activeTabId: nextActiveTabId,
      };
    });
  },

  setActiveTab: (id) => {
    const { tabs } = useTerminalStore.getState();
    const targetTab = tabs.find((tab) => tab.id === id);

    if (targetTab?.kind === 'terminal') {
      const splitStore = useSplitStore.getState();
      const splitTree = splitStore.getSplitTree(id);
      splitStore.setFocusedPane(splitTree ? getPrimaryPaneId(splitTree) : id);
    }

    set({ activeTabId: id });
  },

  updateTabStatus: (id, status) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (isTerminalTab(tab) && tab.id === id ? { ...tab, status } : tab)),
    }));
  },

  setTabSessionId: (id, sessionId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (isTerminalTab(tab) && tab.id === id ? { ...tab, sessionId } : tab)),
    }));
  },

  reorderTabs: (fromIndex, toIndex) => {
    set((state) => {
      const newTabs = [...state.tabs];
      const [movedTab] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, movedTab);
      return { tabs: newTabs };
    });
  },
}));
