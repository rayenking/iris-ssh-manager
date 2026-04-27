import { create } from 'zustand';
import type { SplitBranch, SplitDirection, SplitLeaf, SplitNode } from '../types/split';

type PaneSplitDirection = 'right' | 'left' | 'down' | 'up';

interface SplitState {
  splitTrees: Record<string, SplitNode>;
  focusedPaneId: string | null;
  initSplit: (tabId: string, connectionId: string) => void;
  removeSplit: (tabId: string) => void;
  splitPane: (tabId: string, paneId: string, direction: PaneSplitDirection) => void;
  closePane: (tabId: string, paneId: string) => void;
  updateRatio: (tabId: string, path: number[], ratio: number) => void;
  setFocusedPane: (paneId: string | null) => void;
  getSplitTree: (tabId: string) => SplitNode | null;
  getAllPaneIds: (tabId: string) => string[];
}

function createLeaf(tabId: string, connectionId: string, id?: string): SplitLeaf {
  return {
    type: 'leaf',
    id: id ?? crypto.randomUUID(),
    connectionId,
    tabId,
  };
}

function collectPaneIds(node: SplitNode): string[] {
  if (node.type === 'leaf') {
    return [node.id];
  }

  return [...collectPaneIds(node.first), ...collectPaneIds(node.second)];
}

export function getPrimaryPaneId(node: SplitNode): string {
  if (node.type === 'leaf') {
    return node.id;
  }

  return getPrimaryPaneId(node.first);
}

function createBranch(direction: PaneSplitDirection, original: SplitLeaf, nextLeaf: SplitLeaf): SplitBranch {
  if (direction === 'right') {
    return {
      type: 'branch',
      direction: 'horizontal',
      ratio: 0.5,
      first: original,
      second: nextLeaf,
    };
  }

  if (direction === 'left') {
    return {
      type: 'branch',
      direction: 'horizontal',
      ratio: 0.5,
      first: nextLeaf,
      second: original,
    };
  }

  if (direction === 'down') {
    return {
      type: 'branch',
      direction: 'vertical',
      ratio: 0.5,
      first: original,
      second: nextLeaf,
    };
  }

  return {
    type: 'branch',
    direction: 'vertical',
    ratio: 0.5,
    first: nextLeaf,
    second: original,
  };
}

function splitNode(node: SplitNode, paneId: string, direction: PaneSplitDirection, tabId: string): SplitNode {
  if (node.type === 'leaf') {
    if (node.id !== paneId) {
      return node;
    }

    const nextLeaf = createLeaf(tabId, node.connectionId);
    return createBranch(direction, node, nextLeaf);
  }

  return {
    ...node,
    first: splitNode(node.first, paneId, direction, tabId),
    second: splitNode(node.second, paneId, direction, tabId),
  };
}

function closeNode(node: SplitNode, paneId: string): SplitNode | null {
  if (node.type === 'leaf') {
    return node.id === paneId ? null : node;
  }

  const nextFirst = closeNode(node.first, paneId);
  const nextSecond = closeNode(node.second, paneId);

  if (!nextFirst && !nextSecond) {
    return null;
  }

  if (!nextFirst) {
    return nextSecond;
  }

  if (!nextSecond) {
    return nextFirst;
  }

  return {
    ...node,
    first: nextFirst,
    second: nextSecond,
  };
}

function updateNodeRatio(node: SplitNode, path: number[], ratio: number): SplitNode {
  if (path.length === 0) {
    if (node.type === 'leaf') {
      return node;
    }

    return {
      ...node,
      ratio,
    };
  }

  if (node.type === 'leaf') {
    return node;
  }

  const [segment, ...rest] = path;

  if (segment === 0) {
    return {
      ...node,
      first: updateNodeRatio(node.first, rest, ratio),
    };
  }

  return {
    ...node,
    second: updateNodeRatio(node.second, rest, ratio),
  };
}

function clampRatio(ratio: number) {
  return Math.min(0.85, Math.max(0.15, ratio));
}

export const useSplitStore = create<SplitState>((set, get) => ({
  splitTrees: {},
  focusedPaneId: null,

  initSplit: (tabId, connectionId) => {
    set((state) => {
      if (state.splitTrees[tabId]) {
        return state;
      }

      const root = createLeaf(tabId, connectionId, tabId);

      return {
        splitTrees: {
          ...state.splitTrees,
          [tabId]: root,
        },
        focusedPaneId: state.focusedPaneId ?? root.id,
      };
    });
  },

  removeSplit: (tabId) => {
    set((state) => {
      const tree = state.splitTrees[tabId];

      if (!tree) {
        return state;
      }

      const paneIds = new Set(collectPaneIds(tree));
      const nextTrees = { ...state.splitTrees };
      delete nextTrees[tabId];

      return {
        splitTrees: nextTrees,
        focusedPaneId: state.focusedPaneId && paneIds.has(state.focusedPaneId) ? null : state.focusedPaneId,
      };
    });
  },

  splitPane: (tabId, paneId, direction) => {
    set((state) => {
      const tree = state.splitTrees[tabId];

      if (!tree) {
        return state;
      }

      const nextTree = splitNode(tree, paneId, direction, tabId);
      const nextPaneIds = collectPaneIds(nextTree);
      const previousPaneIds = new Set(collectPaneIds(tree));
      const newPaneId = nextPaneIds.find((id) => !previousPaneIds.has(id)) ?? paneId;

      return {
        splitTrees: {
          ...state.splitTrees,
          [tabId]: nextTree,
        },
        focusedPaneId: newPaneId,
      };
    });
  },

  closePane: (tabId, paneId) => {
    set((state) => {
      const tree = state.splitTrees[tabId];

      if (!tree || tree.type === 'leaf') {
        return state;
      }

      const nextTree = closeNode(tree, paneId);

      if (!nextTree) {
        return state;
      }

      const nextPaneIds = collectPaneIds(nextTree);

      return {
        splitTrees: {
          ...state.splitTrees,
          [tabId]: nextTree,
        },
        focusedPaneId:
          state.focusedPaneId === paneId
            ? nextPaneIds[0] ?? null
            : state.focusedPaneId,
      };
    });
  },

  updateRatio: (tabId, path, ratio) => {
    set((state) => {
      const tree = state.splitTrees[tabId];

      if (!tree) {
        return state;
      }

      return {
        splitTrees: {
          ...state.splitTrees,
          [tabId]: updateNodeRatio(tree, path, clampRatio(ratio)),
        },
      };
    });
  },

  setFocusedPane: (paneId) => set({ focusedPaneId: paneId }),

  getSplitTree: (tabId) => get().splitTrees[tabId] ?? null,

  getAllPaneIds: (tabId) => {
    const tree = get().splitTrees[tabId];
    return tree ? collectPaneIds(tree) : [];
  },
}));

export type { PaneSplitDirection, SplitDirection };
