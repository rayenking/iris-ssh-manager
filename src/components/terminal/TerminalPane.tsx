import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Copy, ClipboardPaste, PanelBottom, PanelLeft, PanelRight, PanelTop, X, ChevronRight, Split, Network } from 'lucide-react';
import { useSplitStore, getPrimaryPaneId, type PaneSplitDirection } from '../../stores/splitStore';
import type { SplitLeaf } from '../../types/split';
import { useTerminalStore } from '../../stores/terminalStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { TerminalView, type TerminalCopyPasteHandle } from './TerminalView';
import { LocalTerminalView } from './LocalTerminalView';
import { TAB_DRAG_TYPE } from '../layout/TabBar';
import { CONNECTION_DRAG_TYPE } from '../connections/ConnectionCard';
import { getActiveDragKind, getActiveDragPayload, isAnyDragActive, endDrag } from '../../lib/dragTracking';

interface Props {
  pane: SplitLeaf;
}

const splitDirections: Array<{
  direction: PaneSplitDirection;
  label: string;
  Icon: typeof PanelRight;
}> = [
  { direction: 'right', label: 'Right', Icon: PanelRight },
  { direction: 'down', label: 'Down', Icon: PanelBottom },
  { direction: 'left', label: 'Left', Icon: PanelLeft },
  { direction: 'up', label: 'Up', Icon: PanelTop },
];

interface TerminalContextMenuProps {
  x: number;
  y: number;
  menuRef: React.RefObject<HTMLDivElement | null>;
  hasSelection: boolean;
  isOnlyPane: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onSplit: (direction: PaneSplitDirection) => void;
  onSplitWithConnection: (connectionId: string, direction: PaneSplitDirection) => void;
  onClose: () => void;
}

function TerminalContextMenu({ x, y, menuRef, hasSelection, isOnlyPane, onCopy, onPaste, onSplit, onSplitWithConnection, onClose }: TerminalContextMenuProps) {
  const [submenu, setSubmenu] = useState<'split' | 'connection' | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const connections = useConnectionStore((state) => state.connections);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-1 shadow-xl"
      style={{ top: y, left: x }}
    >
      {/* Copy */}
      <button
        type="button"
        disabled={!hasSelection}
        onClick={onCopy}
        className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <Copy className="mr-2.5 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        <span className="flex-1">Copy</span>
        <span className="text-[11px] text-[var(--color-text-muted)]">⌘⇧C</span>
      </button>

      {/* Paste */}
      <button
        type="button"
        onClick={onPaste}
        className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
      >
        <ClipboardPaste className="mr-2.5 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        <span className="flex-1">Paste</span>
        <span className="text-[11px] text-[var(--color-text-muted)]">⌘⇧V</span>
      </button>

      <div className="my-1 border-t border-[var(--color-border)]" />

      {/* Split — with submenu */}
      <div
        className="relative"
        onMouseEnter={() => { setSubmenu('split'); setSelectedConnection(null); }}
        onMouseLeave={() => { if (submenu === 'split') setSubmenu(null); }}
      >
        <button
          type="button"
          className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
        >
          <Split className="mr-2.5 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          <span className="flex-1">Split</span>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        </button>
        {submenu === 'split' && (
          <div className="absolute left-full top-0 z-50 ml-0.5 w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-1 shadow-xl">
            {splitDirections.map(({ direction, label, Icon }) => (
              <button
                key={direction}
                type="button"
                onClick={() => onSplit(direction)}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
              >
                <Icon className="mr-2.5 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Split with SSH — with submenu */}
      {connections.length > 0 && (
        <div
          className="relative"
          onMouseEnter={() => { setSubmenu('connection'); setSelectedConnection(null); }}
          onMouseLeave={() => { if (submenu === 'connection') setSubmenu(null); }}
        >
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
          >
            <Network className="mr-2.5 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            <span className="flex-1">Split with SSH</span>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          </button>
          {submenu === 'connection' && (
            <div className="absolute left-full top-0 z-50 ml-0.5 w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-1 shadow-xl">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="relative"
                  onMouseEnter={() => setSelectedConnection(conn.id)}
                  onMouseLeave={() => setSelectedConnection(null)}
                >
                  <button
                    type="button"
                    className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
                  >
                    <span className="flex-1 truncate">{conn.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                  </button>
                  {selectedConnection === conn.id && (
                    <div className="absolute left-full top-0 z-50 ml-0.5 w-36 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-1 shadow-xl">
                      {splitDirections.map(({ direction, label, Icon }) => (
                        <button
                          key={direction}
                          type="button"
                          onClick={() => onSplitWithConnection(conn.id, direction)}
                          className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
                        >
                          <Icon className="mr-2.5 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="my-1 border-t border-[var(--color-border)]" />

      {/* Close Pane */}
      <button
        type="button"
        onClick={onClose}
        className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-error)] hover:bg-[var(--color-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isOnlyPane}
      >
        <X className="mr-2.5 h-3.5 w-3.5" />
        Close Pane
      </button>
    </div>
  );
}

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

export function TerminalPane({ pane }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [dropZone, setDropZone] = useState<PaneSplitDirection | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [externalDragActive, setExternalDragActive] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const copyPasteRef = useRef<TerminalCopyPasteHandle | null>(null);

  useEffect(() => {
    const poll = () => {
      const active = isAnyDragActive('tab', 'connection');
      setExternalDragActive((prev) => (prev !== active ? active : prev));
    };
    const timer = window.setInterval(poll, 100);
    const onStart = (e: globalThis.DragEvent) => {
      const types = e.dataTransfer?.types;
      if (types && (types.includes(TAB_DRAG_TYPE) || types.includes(CONNECTION_DRAG_TYPE))) {
        setExternalDragActive(true);
      }
    };
    const onEnd = () => {
      setExternalDragActive(false);
    };

    document.addEventListener('dragstart', onStart);
    document.addEventListener('dragend', onEnd);
    document.addEventListener('drop', onEnd);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('dragstart', onStart);
      document.removeEventListener('dragend', onEnd);
      document.removeEventListener('drop', onEnd);
    };
  }, []);

  const handleCopyPasteReady = useCallback((handle: TerminalCopyPasteHandle) => {
    copyPasteRef.current = handle;
  }, []);
  const focusedPaneId = useSplitStore((state) => state.focusedPaneIdByTabId[pane.tabId] ?? null);
  const splitTree = useSplitStore((state) => state.splitTrees[pane.tabId] ?? null);
  const setFocusedPane = useSplitStore((state) => state.setFocusedPane);
  const splitPane = useSplitStore((state) => state.splitPane);
  const closePane = useSplitStore((state) => state.closePane);
  const movePaneToTab = useTerminalStore((state) => state.movePaneToTab);
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
    const hasTab = e.dataTransfer.types.includes(TAB_DRAG_TYPE) || isAnyDragActive('tab');
    const hasConnection = e.dataTransfer.types.includes(CONNECTION_DRAG_TYPE) || isAnyDragActive('connection');
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

    const activeKind = getActiveDragKind();
    const tabRaw = e.dataTransfer.getData(TAB_DRAG_TYPE) || (activeKind === 'tab' ? getActiveDragPayload() ?? '' : '');
    const tabPayload = parseTabDragPayload(tabRaw);
    const sourceTabId = tabPayload?.tabId;
    if (sourceTabId) {
      const sourcePaneId = tabPayload?.paneId ?? sourceTabId;
      const sourceTab = useTerminalStore.getState().tabs.find((t) => t.id === sourceTabId);
      if (!sourceTab || (sourceTab.kind !== 'terminal' && sourceTab.kind !== 'local-terminal')) return;
      if (sourceTabId === pane.tabId && sourcePaneId === pane.id) return;
      movePaneToTab(sourceTabId, sourcePaneId, pane.tabId, pane.id, direction);
      return;
    }

    const connectionRaw = e.dataTransfer.getData(CONNECTION_DRAG_TYPE) || (activeKind === 'connection' ? getActiveDragPayload() ?? '' : '');
    if (connectionRaw) {
      try {
        const { id } = JSON.parse(connectionRaw) as { id: string; name: string };
        useSplitStore.getState().splitPaneWithConnection(pane.tabId, pane.id, direction, id);
      } catch { /* ignore */ }
    }
  }, [movePaneToTab, pane.id, pane.tabId]);

  const handleOverlayPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isAnyDragActive('tab', 'connection')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const edgeThreshold = 0.25;

    let direction: PaneSplitDirection | null = null;
    if (x < edgeThreshold && x < y && x < (1 - y)) direction = 'left';
    else if (x > (1 - edgeThreshold) && (1 - x) < y && (1 - x) < (1 - y)) direction = 'right';
    else if (y < edgeThreshold) direction = 'up';
    else if (y > (1 - edgeThreshold)) direction = 'down';

    setDropZone(direction);
  }, []);

  const handleOverlayPointerUp = useCallback((_e: React.PointerEvent<HTMLDivElement>) => {
    const kind = getActiveDragKind();
    const payload = getActiveDragPayload();
    const direction = dropZone;

    setDropZone(null);
    endDrag();

    if (!direction || !payload) return;

    if (kind === 'tab') {
      const tabPayload = parseTabDragPayload(payload);
      const sourceTabId = tabPayload?.tabId;
      if (sourceTabId) {
        const sourcePaneId = tabPayload?.paneId ?? sourceTabId;
        const sourceTab = useTerminalStore.getState().tabs.find((t) => t.id === sourceTabId);
        if (!sourceTab || (sourceTab.kind !== 'terminal' && sourceTab.kind !== 'local-terminal')) return;
        if (sourceTabId === pane.tabId && sourcePaneId === pane.id) return;
        movePaneToTab(sourceTabId, sourcePaneId, pane.tabId, pane.id, direction);
      }
      return;
    }

    if (kind === 'connection') {
      try {
        const { id } = JSON.parse(payload) as { id: string; name: string };
        useSplitStore.getState().splitPaneWithConnection(pane.tabId, pane.id, direction, id);
      } catch { /* ignore */ }
    }
  }, [dropZone, movePaneToTab, pane.id, pane.tabId]);

  const handleOverlayPointerLeave = useCallback(() => {
    setDropZone(null);
  }, []);

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
      onMouseDown={() => setFocusedPane(pane.tabId, pane.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        setFocusedPane(pane.tabId, pane.id);
        setHasSelection(copyPasteRef.current?.hasSelection() ?? false);
        setContextMenu({ x: event.clientX, y: event.clientY });
      }}
      onDragOver={handlePaneDragOver}
      onDragLeave={handlePaneDragLeave}
      onDrop={handlePaneDrop}
      className="group relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden border border-transparent transition-colors"
    >
      {externalDragActive && (
        <div
          className="absolute inset-0 z-20"
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerLeave={handleOverlayPointerLeave}
          onDragOver={handlePaneDragOver}
          onDragLeave={handlePaneDragLeave}
          onDrop={handlePaneDrop}
        />
      )}
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

      {!isOnlyPane && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleClose();
          }}
          className="absolute right-10 top-2 z-20 rounded p-1 text-[var(--color-text-muted)] opacity-0 transition-all hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] group-hover:opacity-100"
          title="Close pane"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {contextMenu && (
        <TerminalContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          menuRef={menuRef}
          hasSelection={hasSelection}
          isOnlyPane={isOnlyPane}
          onCopy={() => { copyPasteRef.current?.copySelection(); setContextMenu(null); }}
          onPaste={() => { void copyPasteRef.current?.pasteClipboard(); setContextMenu(null); }}
          onSplit={(direction) => { handleSplit(direction); }}
          onSplitWithConnection={(connectionId, direction) => {
            setContextMenu(null);
            useSplitStore.getState().splitPaneWithConnection(pane.tabId, pane.id, direction, connectionId);
          }}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
