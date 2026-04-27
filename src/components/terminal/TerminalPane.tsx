import { useEffect, useMemo, useRef, useState } from 'react';
import { PanelBottom, PanelLeft, PanelRight, PanelTop, X } from 'lucide-react';
import { useSplitStore, getPrimaryPaneId, type PaneSplitDirection } from '../../stores/splitStore';
import type { SplitLeaf } from '../../types/split';
import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalView } from './TerminalView';

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

export function TerminalPane({ pane }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
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
        setContextMenu({ x: event.clientX, y: event.clientY });
      }}
      className={`group relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden border transition-colors ${
        isFocused ? 'border-[var(--color-accent)]' : 'border-transparent'
      }`}
    >
      <TerminalView
        connectionId={pane.connectionId}
        tabId={pane.tabId}
        paneId={pane.id}
        isFocusedPane={isFocused}
        reportTabState={isPrimaryPane}
        onStatusChange={isPrimaryPane ? (status) => updateTabStatus(pane.tabId, status) : undefined}
        onSessionChange={isPrimaryPane ? (sessionId) => setTabSessionId(pane.tabId, sessionId) : undefined}
      />

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
          className="fixed z-50 w-48 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
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
