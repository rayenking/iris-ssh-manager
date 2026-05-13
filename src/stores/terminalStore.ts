import { create } from 'zustand';
import type { AppTab, LocalTerminalTab, ReviewDiffTab, TabStatus, TerminalTab } from '../types/terminal';
import { getPrimaryPaneId, useSplitStore, type PaneSplitDirection } from './splitStore';

type TerminalLikeTab = TerminalTab | LocalTerminalTab;

interface TerminalState {
  tabs: AppTab[];
  tabOrder: string[];
  activeTabId: string | null;

  openTab: (connectionId: string, title: string) => void;
  openLocalTab: () => void;
  movePaneToTab: (sourceTabId: string, sourcePaneId: string, targetTabId: string, targetPaneId: string, direction: PaneSplitDirection) => void;
  openFileBrowserTab: (terminalTabId: string, connectionId: string, title: string) => void;
  openReviewDiffTab: (terminalTabId: string, connectionId: string, title: string, filePath: string, repoRoot: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  updateTabStatus: (id: string, status: TabStatus) => void;
  setTabSessionId: (id: string, sessionId?: string) => void;
}

function isTerminalTab(tab: AppTab): tab is TerminalLikeTab {
  return tab.kind === 'terminal' || tab.kind === 'local-terminal';
}

function isTerminalLikeConnection(connectionId: string) {
  return connectionId === 'local' ? 'local-terminal' : 'terminal';
}

function getMergedTabTitle(sourceTitle: string, targetTitle: string) {
  if (sourceTitle === targetTitle) {
    return targetTitle;
  }

  return targetTitle;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  tabs: [],
  tabOrder: [],
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
    useSplitStore.getState().setFocusedPane(newTab.id, newTab.id);

    set((state) => ({
      tabs: [...state.tabs, newTab],
      tabOrder: [...state.tabOrder, newTab.id],
      activeTabId: newTab.id,
    }));
  },

  openLocalTab: () => {
    const newTab: LocalTerminalTab = {
      id: crypto.randomUUID(),
      connectionId: 'local',
      title: 'Terminal',
      kind: 'local-terminal',
      status: 'connecting',
    };

    useSplitStore.getState().initSplit(newTab.id, 'local');
    useSplitStore.getState().setFocusedPane(newTab.id, newTab.id);

    set((state) => ({
      tabs: [...state.tabs, newTab],
      tabOrder: [...state.tabOrder, newTab.id],
      activeTabId: newTab.id,
    }));
  },

  movePaneToTab: (sourceTabId, sourcePaneId, targetTabId, targetPaneId, direction) => {
    const splitStore = useSplitStore.getState();
    const mergedPaneId = splitStore.mergePaneIntoTab(sourceTabId, sourcePaneId, targetTabId, targetPaneId, direction);

    if (!mergedPaneId) {
      return;
    }

    set((state) => {
      const sourceTab = state.tabs.find((tab) => tab.id === sourceTabId);
      const targetTab = state.tabs.find((tab) => tab.id === targetTabId);

      if (!sourceTab || !targetTab || !isTerminalTab(sourceTab) || !isTerminalTab(targetTab)) {
        return state;
      }

      const nextTabs = state.tabs.filter((tab) => {
        if (tab.id === sourceTabId) {
          return false;
        }

        if (tab.kind === 'files' && tab.terminalTabId === sourceTabId) {
          return false;
        }

        return true;
      }).map((tab) => {
        if (tab.id !== targetTabId || !isTerminalTab(tab)) {
          return tab;
        }

        return {
          ...tab,
          title: getMergedTabTitle(sourceTab.title, targetTab.title),
          kind: isTerminalLikeConnection(targetTab.connectionId),
        } as TerminalLikeTab;
      });

      return {
        tabs: nextTabs,
        tabOrder: state.tabOrder.filter((id) => nextTabs.some((t) => t.id === id)),
        activeTabId: targetTabId,
      };
    });
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

  openReviewDiffTab: (terminalTabId, connectionId, title, filePath, repoRoot) => {
    set((state) => {
      const existingTab = state.tabs.find(
        (tab): tab is ReviewDiffTab => tab.kind === 'review-diff' && tab.terminalTabId === terminalTabId,
      );

      if (existingTab) {
        return {
          tabs: state.tabs.map((tab) => tab.id === existingTab.id
            ? {
                ...tab,
                title,
                filePath,
                repoRoot,
                preview: true,
              }
            : tab),
          activeTabId: existingTab.id,
        };
      }

      const newTab: ReviewDiffTab = {
        id: crypto.randomUUID(),
        connectionId,
        title,
        kind: 'review-diff',
        terminalTabId,
        filePath,
        repoRoot,
        preview: true,
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

      if (targetTab && isTerminalTab(targetTab)) {
        splitStore.removeSplit(id);

        state.tabs.forEach((tab) => {
          if ((tab.kind === 'files' || tab.kind === 'review-diff') && tab.terminalTabId === id) {
            tabsToRemove.add(tab.id);
          }
        });
      }

      const newTabs = state.tabs.filter((tab) => !tabsToRemove.has(tab.id));
      const newTabOrder = state.tabOrder.filter((tabId) => !tabsToRemove.has(tabId));
      const activeTabRemoved = state.activeTabId ? tabsToRemove.has(state.activeTabId) : false;
      const nextActiveTabId = activeTabRemoved
        ? newTabs.length > 0
          ? newTabs[newTabs.length - 1].id
          : null
        : state.activeTabId;

      if (nextActiveTabId) {
        const nextActiveTab = newTabs.find((tab) => tab.id === nextActiveTabId);

        if (nextActiveTab && isTerminalTab(nextActiveTab)) {
          const nextTree = splitStore.getSplitTree(nextActiveTab.id);
          splitStore.setFocusedPane(nextActiveTab.id, splitStore.getFocusedPaneId(nextActiveTab.id) ?? (nextTree ? getPrimaryPaneId(nextTree) : nextActiveTab.id));
        }
      }

      return {
        tabs: newTabs,
        tabOrder: newTabOrder,
        activeTabId: nextActiveTabId,
      };
    });
  },

  setActiveTab: (id) => {
    const { tabs } = useTerminalStore.getState();
    const targetTab = tabs.find((tab) => tab.id === id);

    if (targetTab && isTerminalTab(targetTab)) {
      const splitStore = useSplitStore.getState();
      const splitTree = splitStore.getSplitTree(id);
      splitStore.setFocusedPane(id, splitStore.getFocusedPaneId(id) ?? (splitTree ? getPrimaryPaneId(splitTree) : id));
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
      const newOrder = [...state.tabOrder];
      const [movedId] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, movedId);
      return { tabOrder: newOrder };
    });
  },
}));
