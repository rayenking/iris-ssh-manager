import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Copy, ClipboardPaste, PanelBottom, PanelLeft, PanelRight, PanelTop, X } from 'lucide-react';
import { useSplitStore, getPrimaryPaneId, type PaneSplitDirection } from '../../stores/splitStore';
import type { SplitLeaf } from '../../types/split';
import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalView, type TerminalCopyPasteHandle } from './TerminalView';
import { LocalTerminalView } from './LocalTerminalView';
import { TAB_DRAG_TYPE } from '../layout/TabBar';
import { CONNECTION_DRAG_TYPE } from '../connections/ConnectionCard';

interface Props {
  pane: SplitLeaf;
}

const splitItems: Array<{
  direction: PaneSplitDirection;
  label: string;
  Icon: typeof PanelRight;
}> = [
  { direction: 'right', label: 'Split Right', Icon: PanelRight },
  { direction: 'down', label: 'Split Down', Icon: PanelBottom },
  { direction: 'left', label: 'Split Left', Icon: PanelLeft },
  { direction: 'up', label: 'Split Up', Icon: PanelTop },
];

function getDropDirection(e: DragEvent<HTMLDivElement>): PaneSplitDirection | null {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const edgeThreshold = 0.25;

  if (x < edgeThreshold && x < y && x < (1 - y)) return 'left';
  if (x > (1 - edgeThreshold) && (1 - x) < y && (1 - x) < (1 - y)) return 'right';
  if (y < edgeThreshold) return 'up';
  if (y > (1 - edgeThreshold)) return 'down';
  return null;
}

export function TerminalPane({ pane }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [dropZone, setDropZone] = useState<PaneSplitDirection | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const copyPasteRef = useRef<TerminalCopyPasteHandle | null>(null);

  const handleCopyPasteReady = useCallback((handle: TerminalCopyPasteHandle) => {
    copyPasteRef.current = handle;
  }, []);
  const focusedPaneId = useSplitStore((state) => state.focusedPaneId);
  const splitTree = useSplitStore((state) => state.splitTrees[pane.tabId] ?? null);
  const setFocusedPane = useSplitStore((state) => state.setFocusedPane);
  const splitPane = useSplitStore((state) => state.splitPane);
  const closePane = useSplitStore((state) => state.closePane);
  const updateTabStatus = useTerminalStore((state) => state.updateTabStatus);
  const setTabSessionId = useTerminalStore((state) => state.setTabSessionId);

  const isFocused = focusedPaneId === pane.id;
  const isPrimaryPane = useMemo(() => {
    if (!splitTree) {
      return pane.id === pane.tabId;
    }

    return getPrimaryPaneId(splitTree) === pane.id;
  }, [pane.id, pane.tabId, splitTree]);
  const isOnlyPane = splitTree?.type === 'leaf';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu]);

  const handlePaneDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    const hasTab = e.dataTransfer.types.includes(TAB_DRAG_TYPE);
    const hasConnection = e.dataTransfer.types.includes(CONNECTION_DRAG_TYPE);
    if (!hasTab && !hasConnection) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropZone(getDropDirection(e));
  }, []);

  const handlePaneDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDropZone(null);
  }, []);

  const handlePaneDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDropZone(null);

    const direction = getDropDirection(e);
    if (!direction) return;

    const sourceTabId = e.dataTransfer.getData(TAB_DRAG_TYPE);
    if (sourceTabId) {
      const sourceTab = useTerminalStore.getState().tabs.find((t) => t.id === sourceTabId);
      if (!sourceTab || (sourceTab.kind !== 'terminal' && sourceTab.kind !== 'local-terminal')) return;
      useSplitStore.getState().splitPaneWithConnection(pane.tabId, pane.id, direction, sourceTab.connectionId);
      return;
    }

    const connectionRaw = e.dataTransfer.getData(CONNECTION_DRAG_TYPE);
    if (connectionRaw) {
      try {
        const { id } = JSON.parse(connectionRaw) as { id: string; name: string };
        useSplitStore.getState().splitPaneWithConnection(pane.tabId, pane.id, direction, id);
      } catch { /* ignore */ }
    }
  }, [pane.id, pane.tabId]);

  const handleSplit = (direction: PaneSplitDirection) => {
    setContextMenu(null);
    splitPane(pane.tabId, pane.id, direction);
  };

  const handleClose = () => {
    setContextMenu(null);
    closePane(pane.tabId, pane.id);
  };

  return (
    <div
      onMouseDown={() => setFocusedPane(pane.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        setFocusedPane(pane.id);
        setHasSelection(copyPasteRef.current?.hasSelection() ?? false);
        setContextMenu({ x: event.clientX, y: event.clientY });
      }}
      onDragOver={handlePaneDragOver}
      onDragLeave={handlePaneDragLeave}
      onDrop={handlePaneDrop}
      className={`group relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden border transition-colors ${
        isFocused ? 'border-[var(--color-accent)]' : 'border-transparent'
      }`}
    >
      {dropZone && (
        <div className="pointer-events-none absolute inset-0 z-30">
          <div className={`absolute bg-[var(--color-accent)] opacity-20 transition-all ${
            dropZone === 'left' ? 'inset-y-0 left-0 w-1/2' :
            dropZone === 'right' ? 'inset-y-0 right-0 w-1/2' :
            dropZone === 'up' ? 'inset-x-0 top-0 h-1/2' :
            'inset-x-0 bottom-0 h-1/2'
          }`} />
        </div>
      )}
      {pane.connectionId === 'local' ? (
        <LocalTerminalView
          tabId={pane.tabId}
          paneId={pane.id}
          isFocusedPane={isFocused}
          reportTabState={isPrimaryPane}
          onStatusChange={isPrimaryPane ? (status) => updateTabStatus(pane.tabId, status) : undefined}
          onSessionChange={isPrimaryPane ? (sessionId) => setTabSessionId(pane.tabId, sessionId) : undefined}
          onCopyPasteReady={handleCopyPasteReady}
        />
      ) : (
        <TerminalView
          connectionId={pane.connectionId}
          tabId={pane.tabId}
          paneId={pane.id}
          isFocusedPane={isFocused}
          reportTabState={isPrimaryPane}
          onStatusChange={isPrimaryPane ? (status) => updateTabStatus(pane.tabId, status) : undefined}
          onSessionChange={isPrimaryPane ? (sessionId) => setTabSessionId(pane.tabId, sessionId) : undefined}
          onCopyPasteReady={handleCopyPasteReady}
        />
      )}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleClose();
        }}
        className="absolute right-2 top-2 z-20 rounded p-1 text-[var(--color-text-muted)] opacity-0 transition-all hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] group-hover:opacity-100"
        title="Close pane"
      >
        <X className="h-4 w-4" />
      </button>

      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-52 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            type="button"
            disabled={!hasSelection}
            onClick={() => { copyPasteRef.current?.copySelection(); setContextMenu(null); }}
            className="flex w-full items-center px-4 py-2 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
          >
            <Copy className="mr-2 h-4 w-4" />
            <span className="flex-1">Copy</span>
            <span className="text-xs text-[var(--color-text-muted)]">Ctrl+Shift+C</span>
          </button>
          <button
            type="button"
            onClick={() => { void copyPasteRef.current?.pasteClipboard(); setContextMenu(null); }}
            className="flex w-full items-center px-4 py-2 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
          >
            <ClipboardPaste className="mr-2 h-4 w-4" />
            <span className="flex-1">Paste</span>
            <span className="text-xs text-[var(--color-text-muted)]">Ctrl+Shift+V</span>
          </button>
          <div className="my-1 border-t border-[var(--color-border)]" />
          {splitItems.map(({ direction, label, Icon }) => (
            <button
              key={direction}
              type="button"
              onClick={() => handleSplit(direction)}
              className="flex w-full items-center px-4 py-2 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
            >
              <Icon className="mr-2 h-4 w-4" />
              {label}
            </button>
          ))}
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button
            type="button"
            onClick={handleClose}
            className="flex w-full items-center px-4 py-2 text-left text-sm text-[var(--color-error)] hover:bg-[var(--color-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isOnlyPane}
          >
            <X className="mr-2 h-4 w-4" />
            Close Pane
          </button>
        </div>
      )}
    </div>
  );
}
