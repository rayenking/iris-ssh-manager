import { useCallback, useEffect, useRef, useState } from 'react';
import { useTerminalStore } from '../../stores/terminalStore';
import { getPrimaryPaneId, useSplitStore } from '../../stores/splitStore';
import { TerminalTab } from '../terminal/TerminalTab';
import { beginDrag, endDrag } from '../../lib/dragTracking';
import type { AppTab } from '../../types/terminal';

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

const DRAG_THRESHOLD = 4;

export function TabBar({ className }: Props) {
  const { tabs, tabOrder, activeTabId, setActiveTab, closeTab, reorderTabs } = useTerminalStore();
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ tabId: string; side: 'left' | 'right' } | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; tabId: string } | null>(null);
  const draggingRef = useRef(false);
  const dropIndicatorRef = useRef<{ tabId: string; side: 'left' | 'right' } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const orderedTabs = tabOrder.map((id) => tabs.find((t) => t.id === id)).filter(Boolean) as AppTab[];

  useEffect(() => {
    dropIndicatorRef.current = dropIndicator;
  }, [dropIndicator]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, tabId: string) => {
    if (e.button !== 0) return;
    pointerStartRef.current = { x: e.clientX, y: e.clientY, tabId };
    draggingRef.current = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (!draggingRef.current) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      draggingRef.current = true;
      setDragTabId(start.tabId);

      const splitTree = useSplitStore.getState().getSplitTree(start.tabId);
      const payload: TabDragPayload = {
        tabId: start.tabId,
        paneId: splitTree ? getPrimaryPaneId(splitTree) : start.tabId,
      };
      beginDrag('tab', JSON.stringify(payload));
    }

    const container = containerRef.current;
    if (!container) return;

    const tabElements = container.querySelectorAll<HTMLElement>('[data-tab-id]');
    let found = false;
    for (const el of tabElements) {
      const tabId = el.dataset.tabId!;
      if (tabId === start.tabId) continue;
      const rect = el.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        const midX = rect.left + rect.width / 2;
        setDropIndicator({ tabId, side: e.clientX < midX ? 'left' : 'right' });
        found = true;
        break;
      }
    }
    if (!found) setDropIndicator(null);
  }, []);

  const handlePointerUp = useCallback(() => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;

    if (!draggingRef.current) {
      if (start) setActiveTab(start.tabId);
      setDragTabId(null);
      setDropIndicator(null);
      endDrag();
      return;
    }

    draggingRef.current = false;

    const indicator = dropIndicatorRef.current;
    if (start && indicator) {
      const currentOrder = useTerminalStore.getState().tabOrder;
      const sourceIndex = currentOrder.indexOf(start.tabId);
      const targetIndex = currentOrder.indexOf(indicator.tabId);
      if (sourceIndex !== -1 && targetIndex !== -1) {
        let toIndex = indicator.side === 'left' ? targetIndex : targetIndex + 1;
        if (sourceIndex < toIndex) toIndex -= 1;
        if (sourceIndex !== toIndex) reorderTabs(sourceIndex, toIndex);
      }
    }

    endDrag();
    setDragTabId(null);
    setDropIndicator(null);
  }, [reorderTabs, setActiveTab]);

  useEffect(() => {
    if (!dragTabId) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pointerStartRef.current = null;
        draggingRef.current = false;
        endDrag();
        setDragTabId(null);
        setDropIndicator(null);
      }
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      const container = containerRef.current;
      if (container && container.contains(e.target as Node)) return;
      // Pointer released outside TabBar — just cleanup, no reorder
      pointerStartRef.current = null;
      draggingRef.current = false;
      endDrag();
      setDragTabId(null);
      setDropIndicator(null);
    };

    window.addEventListener('keydown', handleEscape);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [dragTabId]);

  return (
    <div className={cn('flex min-w-0 flex-1 items-center', className)}>
      <div
        ref={containerRef}
        className="flex min-w-max items-center gap-1 overflow-x-auto px-2"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {orderedTabs.map((tab) => (
          <TerminalTab
            key={tab.id}
            tab={tab}
            isActive={activeTabId === tab.id}
            isDragging={dragTabId === tab.id}
            onSelect={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onPointerDown={(e) => handlePointerDown(e, tab.id)}
            dropIndicator={dropIndicator?.tabId === tab.id ? dropIndicator?.side : null}
          />
        ))}
      </div>
      <div data-tauri-drag-region className="h-full min-w-0 flex-1" />
    </div>
  );
}
