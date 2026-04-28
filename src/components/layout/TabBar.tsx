import { FolderOpen, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { DragEvent } from 'react';
import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalTab } from '../terminal/TerminalTab';

export const TAB_DRAG_TYPE = 'application/x-iris-tab';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, openFileBrowserTab, reorderTabs } = useTerminalStore();
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null);

  const handleOpenFiles = () => {
    if (!activeTab || activeTab.kind !== 'terminal' || !activeTab.sessionId) {
      return;
    }

    openFileBrowserTab(activeTab.id, activeTab.connectionId, activeTab.title);
  };

  const handleTabDragStart = useCallback((e: DragEvent<HTMLDivElement>, tabId: string) => {
    e.dataTransfer.setData(TAB_DRAG_TYPE, tabId);
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
    const sourceTabId = e.dataTransfer.getData(TAB_DRAG_TYPE);
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
    <div className="flex items-center h-10 bg-[var(--color-bg-primary)] border-b border-[var(--color-border)] overflow-x-auto shrink-0" onDragLeave={handleBarDragLeave}>
      <div className="flex flex-1 items-center h-full">
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

      <button
        className="h-full px-3 flex items-center gap-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors border-l border-[var(--color-border)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!activeTab || activeTab.kind !== 'terminal' || !activeTab.sessionId}
        onClick={handleOpenFiles}
        title="Open SFTP file browser"
        type="button"
      >
        <FolderOpen className="w-4 h-4" />
      </button>

      <button 
        className="h-full px-3 flex items-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors border-l border-[var(--color-border)]"
        type="button"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
