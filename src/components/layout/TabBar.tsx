import { useCallback, useState } from 'react';
import type { DragEvent } from 'react';
import { useTerminalStore } from '../../stores/terminalStore';
import { getPrimaryPaneId, useSplitStore } from '../../stores/splitStore';
import { TerminalTab } from '../terminal/TerminalTab';

interface Props {
  className?: string;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export const TAB_DRAG_TYPE = 'application/x-iris-tab';

type TabDragPayload = {
  tabId: string;
  paneId?: string;
};

function parseTabDragPayload(raw: string): TabDragPayload | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as TabDragPayload;
    if (!parsed?.tabId) return null;
    return parsed;
  } catch {
    return { tabId: raw };
  }
}

export function TabBar({ className }: Props) {
  const { tabs, activeTabId, setActiveTab, closeTab, reorderTabs } = useTerminalStore();
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null);

  const handleTabDragStart = useCallback((e: DragEvent<HTMLDivElement>, tabId: string) => {
    const splitTree = useSplitStore.getState().getSplitTree(tabId);
    const payload: TabDragPayload = {
      tabId,
      paneId: splitTree ? getPrimaryPaneId(splitTree) : tabId,
    };
    e.dataTransfer.setData(TAB_DRAG_TYPE, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleTabDragOver = useCallback((e: DragEvent<HTMLDivElement>, tabId: string) => {
    if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    setDragOverTabId(tabId);
    setDropSide(e.clientX < midX ? 'left' : 'right');
  }, []);

  const handleTabDrop = useCallback((e: DragEvent<HTMLDivElement>, targetTabId: string) => {
    e.preventDefault();
    const payload = parseTabDragPayload(e.dataTransfer.getData(TAB_DRAG_TYPE));
    const sourceTabId = payload?.tabId;
    setDragOverTabId(null);
    setDropSide(null);
    if (!sourceTabId || sourceTabId === targetTabId) return;

    const sourceIndex = tabs.findIndex((t) => t.id === sourceTabId);
    const targetIndex = tabs.findIndex((t) => t.id === targetTabId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const insertBefore = e.clientX < midX;
    let toIndex = insertBefore ? targetIndex : targetIndex + 1;
    if (sourceIndex < toIndex) toIndex -= 1;
    if (sourceIndex !== toIndex) reorderTabs(sourceIndex, toIndex);
  }, [tabs, reorderTabs]);

  const handleBarDragLeave = useCallback(() => {
    setDragOverTabId(null);
    setDropSide(null);
  }, []);

  return (
    <div className={cn('flex min-w-0 flex-1 items-center overflow-x-auto', className)} onDragLeave={handleBarDragLeave}>
      <div className="flex min-w-max items-center gap-1 px-2">
        {tabs.map((tab) => (
          <TerminalTab
            key={tab.id}
            tab={tab}
            isActive={activeTabId === tab.id}
            onSelect={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onDragStart={(e) => handleTabDragStart(e, tab.id)}
            onDragOver={(e) => handleTabDragOver(e, tab.id)}
            onDrop={(e) => handleTabDrop(e, tab.id)}
            dropIndicator={dragOverTabId === tab.id ? dropSide : null}
          />
        ))}
      </div>
    </div>
  );
}
