import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Code, Copy, Edit, FolderGit2, FolderOpen, FolderTree, Minus, Plus, Search, Settings, Square, Terminal, Trash2, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { useUiStore } from '../../stores/uiStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { TabBar } from './TabBar';
import type { Connection } from '../../types/connection';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type TerminalLaunchItem =
  | { id: 'new-connection'; title: string; subtitle: string; kind: 'action' }
  | { id: 'local'; title: string; subtitle: string; kind: 'local' }
  | { id: string; title: string; subtitle: string; kind: 'connection'; connection: Connection };

function filterConnections(connections: Connection[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return connections;
  }

  return connections.filter((connection) =>
    connection.name.toLowerCase().includes(normalizedQuery)
    || connection.hostname.toLowerCase().includes(normalizedQuery)
    || connection.username.toLowerCase().includes(normalizedQuery),
  );
}

function resolveCodeReviewSourceTabId(activeTab: ReturnType<typeof useTerminalStore.getState>['tabs'][number] | null) {
  if (!activeTab) {
    return null;
  }

  if (activeTab.kind === 'terminal' || activeTab.kind === 'local-terminal') {
    return activeTab.id;
  }

  if (activeTab.kind === 'files' || activeTab.kind === 'review-diff') {
    return activeTab.terminalTabId;
  }

  return null;
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [terminalPickerOpen, setTerminalPickerOpen] = useState(false);
  const [terminalModalOpen, setTerminalModalOpen] = useState(false);
  const [terminalQuery, setTerminalQuery] = useState('');
  const [terminalModalQuery, setTerminalModalQuery] = useState('');
  const [pickerSelectedIndex, setPickerSelectedIndex] = useState(0);
  const [modalSelectedIndex, setModalSelectedIndex] = useState(0);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const {
    explorerOpen,
    toggleExplorer,
    snippetsOpen,
    toggleSnippets,
    codeReviewOpen,
    toggleCodeReview,
    setCodeReviewSourceTabId,
    setSettingsOpen,
  } = useUiStore();
  const { tabs, activeTabId, openFileBrowserTab, openLocalTab, openTab } = useTerminalStore();
  const connections = useConnectionStore((state) => state.connections);
  const fetchConnections = useConnectionStore((state) => state.fetchConnections);
  const deleteConnection = useConnectionStore((state) => state.deleteConnection);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const [connContextMenu, setConnContextMenu] = useState<{ x: number; y: number; connection: Connection } | null>(null);
  const connMenuRef = useRef<HTMLDivElement | null>(null);

  const handleToggleCodeReview = () => {
    const sourceTabId = resolveCodeReviewSourceTabId(activeTab);
    if (!codeReviewOpen && sourceTabId) {
      setCodeReviewSourceTabId(sourceTabId);
    }
    if (!codeReviewOpen && !sourceTabId) {
      setCodeReviewSourceTabId(null);
    }
    toggleCodeReview();
  };

  useEffect(() => {
    if (!codeReviewOpen) {
      return;
    }

    const sourceTabId = resolveCodeReviewSourceTabId(activeTab);
    if (sourceTabId) {
      setCodeReviewSourceTabId(sourceTabId);
    }
  }, [activeTab, codeReviewOpen, setCodeReviewSourceTabId]);

  useEffect(() => {
    if (codeReviewOpen && !tabs.some((tab) => tab.id === activeTabId)) {
      setCodeReviewSourceTabId(null);
    }
  }, [activeTabId, codeReviewOpen, setCodeReviewSourceTabId, tabs]);

  useEffect(() => {
    if (!codeReviewOpen) {
      setCodeReviewSourceTabId(null);
    }
  }, [codeReviewOpen, setCodeReviewSourceTabId]);

  const orderedConnections = useMemo(
    () => [...connections].sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)),
    [connections],
  );
  const quickConnections = useMemo(
    () => filterConnections(orderedConnections, terminalQuery).slice(0, 3),
    [orderedConnections, terminalQuery],
  );
  const modalConnections = useMemo(
    () => filterConnections(orderedConnections, terminalModalQuery),
    [orderedConnections, terminalModalQuery],
  );
  const pickerItems = useMemo<TerminalLaunchItem[]>(() => ([
    { id: 'new-connection', title: 'New Connection', subtitle: 'Add a saved SSH connection', kind: 'action' },
    { id: 'local', title: 'Local Terminal', subtitle: 'Open a shell on this machine', kind: 'local' },
    ...quickConnections.map((connection) => ({
      id: connection.id,
      title: connection.name,
      subtitle: `${connection.username}@${connection.hostname}:${connection.port}`,
      kind: 'connection' as const,
      connection,
    })),
  ]), [quickConnections]);
  const modalItems = useMemo<TerminalLaunchItem[]>(() => ([
    { id: 'new-connection', title: 'New Connection', subtitle: 'Add a saved SSH connection', kind: 'action' },
    { id: 'local', title: 'Local Terminal', subtitle: 'Open a shell on this machine', kind: 'local' },
    ...modalConnections.map((connection) => ({
      id: connection.id,
      title: connection.name,
      subtitle: `${connection.username}@${connection.hostname}:${connection.port}`,
      kind: 'connection' as const,
      connection,
    })),
  ]), [modalConnections]);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  useEffect(() => {
    if (!isTauri) return;

    try {
      setIsMac(platform() === 'macos');
    } catch {}

    const win = getCurrentWindow();
    const syncWindowState = () => {
      win.isMaximized().then(setMaximized);
      win.isFullscreen().then(setFullscreen);
    };
    syncWindowState();

    let unlisten: (() => void) | null = null;
    win.onResized(syncWindowState).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!terminalPickerOpen) {
      setTerminalQuery('');
      setPickerSelectedIndex(0);
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setTerminalPickerOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTerminalPickerOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [terminalPickerOpen]);

  useEffect(() => {
    if (!terminalModalOpen) {
      setTerminalModalQuery('');
      setModalSelectedIndex(0);
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!modalRef.current?.contains(event.target as Node)) {
        setTerminalModalOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTerminalModalOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [terminalModalOpen]);

  useEffect(() => {
    setPickerSelectedIndex((current) => Math.min(current, Math.max(pickerItems.length - 1, 0)));
  }, [pickerItems.length]);

  useEffect(() => {
    setModalSelectedIndex((current) => Math.min(current, Math.max(modalItems.length - 1, 0)));
  }, [modalItems.length]);

  useEffect(() => {
    if (!connContextMenu) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (connMenuRef.current && !connMenuRef.current.contains(e.target as Node)) {
        setConnContextMenu(null);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [connContextMenu]);

  const handleOpenConnectionForm = () => {
    window.dispatchEvent(new CustomEvent('open-connection-form', { detail: { connection: null } }));
  };

  const launchItem = (item: TerminalLaunchItem) => {
    if (item.kind === 'action') {
      handleOpenConnectionForm();
      return;
    }

    if (item.kind === 'local') {
      openLocalTab();
      return;
    }

    openTab(item.connection.id, item.connection.name);
  };

  const handleMinimize = () => {
    if (isTauri) getCurrentWindow().minimize();
  };

  const handleMaximize = () => {
    if (isTauri) getCurrentWindow().toggleMaximize();
  };

  const handleClose = () => {
    if (isTauri) getCurrentWindow().close();
  };

  const handleOpenFiles = () => {
    if (!activeTab || activeTab.kind !== 'terminal' || !activeTab.sessionId) {
      return;
    }

    openFileBrowserTab(activeTab.id, activeTab.connectionId, activeTab.title);
  };

  const handlePickerKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (pickerItems.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setPickerSelectedIndex((current) => (current + 1) % pickerItems.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setPickerSelectedIndex((current) => (current - 1 + pickerItems.length) % pickerItems.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const item = pickerItems[pickerSelectedIndex];
      if (!item) {
        return;
      }
      launchItem(item);
      setTerminalPickerOpen(false);
    }
  };

  const handleModalKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (modalItems.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setModalSelectedIndex((current) => (current + 1) % modalItems.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setModalSelectedIndex((current) => (current - 1 + modalItems.length) % modalItems.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const item = modalItems[modalSelectedIndex];
      if (!item) {
        return;
      }
      launchItem(item);
      setTerminalModalOpen(false);
    }
  };

  return (
    <>
      <div className="flex h-11 shrink-0 select-none items-center border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        {isMac && !fullscreen ? <div data-tauri-drag-region className="w-[78px] h-full shrink-0" /> : <div data-tauri-drag-region className="h-full w-2 shrink-0" />}

        <div className="flex shrink-0 items-center gap-1 px-2">
          <img src="/assets/logo.png" alt="" className="h-4 w-4" draggable={false} />
          <button
            onClick={toggleExplorer}
            className={`rounded-md p-1.5 transition-colors ${
              explorerOpen
                ? 'bg-[var(--color-hover)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
            }`}
            title={explorerOpen ? 'Close Explorer' : 'Open Explorer'}
            type="button"
          >
            <FolderTree className="h-4 w-4" />
          </button>
          <button
            onClick={handleToggleCodeReview}
            className={`rounded-md p-1.5 transition-colors ${
              codeReviewOpen
                ? 'bg-[var(--color-hover)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
            }`}
            title={codeReviewOpen ? 'Close Code Review' : 'Open Code Review'}
            type="button"
          >
            <FolderGit2 className="h-4 w-4" />
          </button>
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setTerminalPickerOpen((open) => !open)}
              className={`rounded-md p-1.5 transition-colors ${
                terminalPickerOpen
                  ? 'bg-[var(--color-hover)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
              }`}
              title="Open terminal"
              type="button"
            >
              <Terminal className="h-4 w-4" />
            </button>

            {terminalPickerOpen && (
              <div className="absolute left-0 top-[calc(100%+10px)] z-50 w-88 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur">
                <div className="border-b border-[var(--color-border)] px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Open Terminal</div>
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2">
                    <Search className="h-4 w-4 text-[var(--color-text-muted)]" />
                    <input
                      autoFocus
                      className="w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
                      onChange={(event) => setTerminalQuery(event.target.value)}
                      onKeyDown={handlePickerKeyDown}
                      placeholder="Search quick terminal targets..."
                      type="text"
                      value={terminalQuery}
                    />
                  </div>
                </div>

                <div className="border-b border-[var(--color-border)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Quick Actions
                </div>
                <div className="p-2">
                  {pickerItems.slice(0, 2).map((item, index) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        launchItem(item);
                        setTerminalPickerOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-[var(--color-text-primary)] transition-colors ${
                        pickerSelectedIndex === index ? 'bg-[var(--color-hover)]' : 'hover:bg-[var(--color-hover)]'
                      }`}
                      type="button"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
                        {item.kind === 'action' ? <Plus className="h-4 w-4" /> : <Terminal className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.title}</div>
                        <div className="truncate text-xs text-[var(--color-text-secondary)]">{item.subtitle}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="border-b border-t border-[var(--color-border)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Recent Connections
                </div>
                <div className="p-2">
                  {pickerItems.slice(2).length > 0 ? (
                    pickerItems.slice(2).map((item, offset) => {
                      const index = offset + 2;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            launchItem(item);
                            setTerminalPickerOpen(false);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (item.kind === 'connection') {
                              setConnContextMenu({ x: e.clientX, y: e.clientY, connection: item.connection });
                            }
                          }}
                          onMouseDown={(e) => {
                            if (e.button === 2 && item.kind === 'connection') {
                              e.preventDefault();
                              e.stopPropagation();
                              setConnContextMenu({ x: e.clientX, y: e.clientY, connection: item.connection });
                            }
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-[var(--color-text-primary)] transition-colors ${
                            pickerSelectedIndex === index ? 'bg-[var(--color-hover)]' : 'hover:bg-[var(--color-hover)]'
                          }`}
                          type="button"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
                            <Terminal className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{item.title}</div>
                            <div className="truncate text-xs text-[var(--color-text-secondary)]">{item.subtitle}</div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-3 text-sm text-[var(--color-text-muted)]">No matching quick connections.</div>
                  )}
                </div>

                <div className="flex justify-center border-t border-[var(--color-border)] px-4 py-3">
                  <button
                    onClick={() => {
                      setTerminalPickerOpen(false);
                      setTerminalModalOpen(true);
                    }}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-hover)]"
                    type="button"
                  >
                    Show all
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>

        <div data-tauri-drag-region className="h-full w-2 shrink-0" />

        <div className="min-w-0 flex-1 h-full">
          <TabBar className="px-1" />
        </div>

        <div data-tauri-drag-region className="h-full w-1 shrink-0" />

        <div className="flex h-full shrink-0 items-center border-l border-[var(--color-border)] pl-2">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!activeTab || activeTab.kind !== 'terminal' || !activeTab.sessionId}
            onClick={handleOpenFiles}
            title="Open SFTP file browser"
            type="button"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
          <button
            onClick={toggleSnippets}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              snippetsOpen
                ? 'bg-[var(--color-hover)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
            }`}
            title={snippetsOpen ? 'Close Snippets' : 'Open Snippets'}
            type="button"
          >
            <Code className="h-4 w-4" />
          </button>
          <button
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
            title="Settings"
            type="button"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        {!isMac && (
          <div className="ml-2 flex h-full shrink-0 border-l border-[var(--color-border)]">
            <button
              type="button"
              onClick={handleMinimize}
              className="flex h-full w-11 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleMaximize}
              className="flex h-full w-11 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
            >
              {maximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-full w-11 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-red-600 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {terminalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div
            ref={modalRef}
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">Open Terminal</div>
                <div className="mt-1 text-xs text-[var(--color-text-muted)]">Browse all saved SSH connections or launch a local shell.</div>
              </div>
              <button
                onClick={() => setTerminalModalOpen(false)}
                className="rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2">
                <Search className="h-4 w-4 text-[var(--color-text-muted)]" />
                <input
                  autoFocus
                  className="w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
                  onChange={(event) => setTerminalModalQuery(event.target.value)}
                  onKeyDown={handleModalKeyDown}
                  placeholder="Search all saved SSH connections..."
                  type="text"
                  value={terminalModalQuery}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                Actions
              </div>
              {modalItems.slice(0, 2).map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => {
                    launchItem(item);
                    setTerminalModalOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-[var(--color-text-primary)] transition-colors ${
                    modalSelectedIndex === index ? 'bg-[var(--color-hover)]' : 'hover:bg-[var(--color-hover)]'
                  }`}
                  type="button"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
                    {item.kind === 'action' ? <Plus className="h-4 w-4" /> : <Terminal className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.title}</div>
                    <div className="truncate text-xs text-[var(--color-text-secondary)]">{item.subtitle}</div>
                  </div>
                </button>
              ))}

              <div className="px-2 pb-2 pt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                Saved SSH Connections
              </div>
              {modalItems.slice(2).length > 0 ? (
                modalItems.slice(2).map((item, offset) => {
                  const index = offset + 2;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        launchItem(item);
                        setTerminalModalOpen(false);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (item.kind === 'connection') {
                          setConnContextMenu({ x: e.clientX, y: e.clientY, connection: item.connection });
                        }
                      }}
                      onMouseDown={(e) => {
                        if (e.button === 2 && item.kind === 'connection') {
                          e.preventDefault();
                          e.stopPropagation();
                          setConnContextMenu({ x: e.clientX, y: e.clientY, connection: item.connection });
                        }
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-[var(--color-text-primary)] transition-colors ${
                        modalSelectedIndex === index ? 'bg-[var(--color-hover)]' : 'hover:bg-[var(--color-hover)]'
                      }`}
                      type="button"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
                        <Terminal className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.title}</div>
                        <div className="truncate text-xs text-[var(--color-text-secondary)]">{item.subtitle}</div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-6 text-sm text-[var(--color-text-muted)]">
                  No matching SSH connections.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {connContextMenu && createPortal(
        <div
          ref={connMenuRef}
          className="fixed z-[9999] min-w-[160px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          style={{ top: connContextMenu.y, left: connContextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
            onClick={() => {
              const conn = connContextMenu.connection;
              setConnContextMenu(null);
              setTerminalPickerOpen(false);
              setTerminalModalOpen(false);
              window.dispatchEvent(new CustomEvent('open-connection-form', { detail: { connection: conn } }));
            }}
          >
            <Edit className="h-3.5 w-3.5 text-[var(--color-text-muted)]" /> Edit
          </button>
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-400 hover:bg-red-500/10"
            onClick={async () => {
              const conn = connContextMenu.connection;
              setConnContextMenu(null);
              if (window.confirm(`Delete connection "${conn.name}"?`)) {
                await deleteConnection(conn.id);
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
