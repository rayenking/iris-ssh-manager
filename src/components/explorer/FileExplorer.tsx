import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { ChevronRight, Eye, EyeOff, File as FileIcon, Folder, FolderTree, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tauriApi } from '../../lib/tauri';
import { useTerminalStore } from '../../stores/terminalStore';
import { useUiStore } from '../../stores/uiStore';
import type { FileEntry } from '../../types/sftp';

interface TreeNode {
  entry: FileEntry;
  path: string;
  depth: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: TreeNode;
}

type DirectoryMap = Record<string, FileEntry[]>;

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function FileExplorer() {
  const { activeTabId, tabs, tabCwds, setTabCwd, openFileBrowserTab } = useTerminalStore();
  const setEditorFile = useUiStore((state) => state.setEditorFile);
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const rawCwd = activeTabId ? tabCwds[activeTabId] ?? '' : '';
  // Default to '.' for remote or '' for local when cwd hasn't been reported yet
  const activeCwd = rawCwd || (activeTab?.kind === 'terminal' ? '.' : activeTab?.kind === 'local-terminal' ? '' : '');
  const [directoryMap, setDirectoryMap] = useState<DirectoryMap>({});
  const directoryMapRef = useRef<DirectoryMap>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const hasTerminalTab = activeTab?.kind === 'terminal' || activeTab?.kind === 'local-terminal';
  const canBrowseRemote = activeTab?.kind === 'terminal' && Boolean(activeTab.sessionId);
  const canBrowseLocal = activeTab?.kind === 'local-terminal' && Boolean(activeTab.sessionId);
  const canBrowse = (canBrowseRemote || canBrowseLocal);

  const listDirectory = useCallback(async (path: string) => {
    if (!activeTab) {
      return [] as FileEntry[];
    }

    if (activeTab.kind === 'local-terminal') {
      return tauriApi.localListDir(path);
    }

    if (activeTab.kind === 'terminal' && activeTab.sessionId) {
      return tauriApi.sftpListDir(activeTab.sessionId, path);
    }

    return [] as FileEntry[];
  }, [activeTab]);

  const loadDirectory = useCallback(async (path: string, force = false) => {
    if (!canBrowse) {
      return;
    }

    if (!force && directoryMapRef.current[path]) {
      return;
    }

    setLoadingPath(path);
    setError(null);

    try {
      const entries = await listDirectory(path);
      const sorted = sortEntries(entries);
      setDirectoryMap((current) => {
        const next = { ...current, [path]: sorted };
        directoryMapRef.current = next;
        return next;
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load directory';
      setError(message);
    } finally {
      setLoadingPath((current) => (current === path ? null : current));
    }
  }, [canBrowse, listDirectory]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  useEffect(() => {
    setDirectoryMap({});
    directoryMapRef.current = {};
    setExpandedPaths(new Set());
    setContextMenu(null);
    setError(null);

    if (!canBrowse) return;

    const resolveAndLoad = async () => {
      let root = activeCwd || '.';

      if ((root === '.' || root === '') && canBrowseRemote && activeTab?.kind === 'terminal' && activeTab.sessionId) {
        try {
          const resolved = await tauriApi.sftpRealpath(activeTab.sessionId, '.');
          if (resolved && resolved !== '.') {
            root = resolved;
            if (activeTabId) setTabCwd(activeTabId, resolved);
          }
        } catch {}
      }

      if ((root === '' || root === '.') && canBrowseLocal) {
        try {
          const homeEntries = await tauriApi.localListDir('');
          if (homeEntries.length > 0) {
            root = '';
          }
        } catch {}
      }

      void loadDirectory(root, true);
    };

    void resolveAndLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCwd, activeTabId, canBrowse]);

  const handleRefresh = useCallback(async () => {
    if (!canBrowse) {
      return;
    }

    const root = activeCwd || '.';
    const paths = [root, ...expandedPaths];
    await Promise.all(paths.map((path) => loadDirectory(path, true)));
  }, [activeCwd, canBrowse, expandedPaths, loadDirectory]);

  const handleToggleExpand = useCallback(async (path: string) => {
    const nextExpanded = new Set(expandedPaths);

    if (nextExpanded.has(path)) {
      nextExpanded.delete(path);
      setExpandedPaths(nextExpanded);
      return;
    }

    nextExpanded.add(path);
    setExpandedPaths(nextExpanded);
    await loadDirectory(path);
  }, [expandedPaths, loadDirectory]);

  const handleCopyPath = useCallback(async (path: string) => {
    try {
      if (isTauriRuntime()) {
        await writeText(path);
      } else {
        await navigator.clipboard.writeText(path);
      }
      setError(null);
    } catch (copyError) {
      const message = copyError instanceof Error ? copyError.message : 'Failed to copy path';
      setError(message);
    }
  }, []);

  const handleOpenFile = useCallback(async (path: string) => {
    if (isBinaryFile(path)) {
      await handleCopyPath(path);
      return;
    }

    if (activeTab?.kind === 'local-terminal') {
      setEditorFile({ path, isLocal: true, sessionId: activeTab.sessionId });
      return;
    }

    if (activeTab?.kind === 'terminal' && activeTab.sessionId) {
      setEditorFile({ path, isLocal: false, sessionId: activeTab.sessionId });
      return;
    }

    await handleCopyPath(path);
  }, [activeTab, handleCopyPath, setEditorFile]);

  const handleCdToPath = useCallback(async (path: string) => {
    if (!activeTabId || !activeTab) {
      return;
    }

    const command = `cd ${shellEscape(path)}\n`;
    const data = Array.from(new TextEncoder().encode(command));

    try {
      if (activeTab.kind === 'local-terminal' && activeTab.sessionId) {
        await tauriApi.localShellWrite(activeTab.sessionId, data);
        setTabCwd(activeTabId, path);
        return;
      }

      if (activeTab.kind === 'terminal' && activeTab.sessionId) {
        await tauriApi.sshWrite(activeTab.sessionId, data);
        setTabCwd(activeTabId, path);
      }
    } catch (writeError) {
      const message = writeError instanceof Error ? writeError.message : 'Failed to change directory';
      setError(message);
    }
  }, [activeTab, activeTabId, setTabCwd]);

  const handleOpenSftp = useCallback(() => {
    if (!activeTab || activeTab.kind !== 'terminal') {
      return;
    }

    openFileBrowserTab(activeTab.id, activeTab.connectionId, activeTab.title);
  }, [activeTab, openFileBrowserTab]);

  const rootKey = activeCwd || '.';
  const rootEntries = useMemo(
    () => filterEntries(directoryMap[rootKey] ?? [], showHidden),
    [directoryMap, rootKey, showHidden],
  );
  const treeNodes = useMemo(
    () => buildTreeNodes(rootEntries, rootKey, expandedPaths, directoryMap, showHidden),
    [rootKey, directoryMap, expandedPaths, rootEntries, showHidden],
  );
  if (!hasTerminalTab) {
    return (
      <div className="flex h-full flex-col bg-[var(--color-bg-secondary)]">
        <ExplorerHeader
          pathLabel="Explorer"
          onRefresh={undefined}
          showHidden={showHidden}
          onToggleShowHidden={() => setShowHidden((current) => !current)}
          onOpenSftp={undefined}
          openSftpDisabled
        />
        <div className="flex flex-1 items-center justify-center px-5 text-center text-sm text-[var(--color-text-muted)]">
          Open a terminal to browse files
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-secondary)]">
      <ExplorerHeader
        pathLabel={formatPathLabel(activeCwd)}
        onRefresh={canBrowse ? () => void handleRefresh() : undefined}
        showHidden={showHidden}
        onToggleShowHidden={() => setShowHidden((current) => !current)}
        onOpenSftp={canBrowseRemote ? handleOpenSftp : undefined}
        openSftpDisabled={!canBrowseRemote}
      />

      {error && (
        <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-error)]">
          {error}
        </div>
      )}

      {!canBrowse ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-sm text-[var(--color-text-muted)]">
          Waiting for the terminal to report its current directory
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {activeCwd && activeCwd !== '/' && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
              onClick={() => {
                const parent = getParentPath(activeCwd);
                void handleCdToPath(parent || '..');
              }}
            >
              <span className="w-4 shrink-0 text-center">..</span>
              <span className="truncate">{getParentPath(activeCwd) || '..'}</span>
            </button>
          )}

          {treeNodes.map((node) => {
            const isExpanded = expandedPaths.has(node.path);
            const childEntries = filterEntries(directoryMap[node.path] ?? [], showHidden);
            const isLoadingChildren = loadingPath === node.path;

            return (
              <div key={node.path}>
                <div
                  className="group flex items-center gap-1 pr-2 hover:bg-[var(--color-hover)]"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({ x: event.clientX, y: event.clientY, node });
                  }}
                >
                  <div style={{ width: 10 + node.depth * 14 }} className="shrink-0" />

                  {node.entry.isDir ? (
                    <button
                      type="button"
                      className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
                      onClick={() => void handleToggleExpand(node.path)}
                      title={isExpanded ? 'Collapse folder' : 'Expand folder'}
                    >
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}

                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                    onClick={() => void (node.entry.isDir ? handleCdToPath(node.path) : handleOpenFile(node.path))}
                    title={node.path}
                  >
                    {node.entry.isDir ? (
                      <Folder className="h-4 w-4 shrink-0 text-[var(--color-warning)]" />
                    ) : (
                      <FileIcon className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
                    )}
                    <span className="truncate text-xs text-[var(--color-text-primary)]">{node.entry.name}</span>
                  </button>

                  <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">
                    {node.entry.isDir ? '' : formatBytes(node.entry.size)}
                  </span>

                  {node.entry.isDir && isExpanded && isLoadingChildren && (
                    <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">…</span>
                  )}

                  {node.entry.isDir && isExpanded && !isLoadingChildren && childEntries.length > 0 && (
                    <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">{childEntries.length}</span>
                  )}
                </div>
              </div>
            );
          })}

          {!loadingPath && rootEntries.length === 0 && (
            <div className="px-3 py-4 text-sm text-[var(--color-text-muted)]">This directory is empty.</div>
          )}
        </div>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 w-40 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.node.entry.isDir && (
            <ContextItem label="cd here" onClick={() => {
              void handleCdToPath(contextMenu.node.path);
              setContextMenu(null);
            }} />
          )}
          <ContextItem label="Copy path" onClick={() => {
            void handleCopyPath(contextMenu.node.path);
            setContextMenu(null);
          }} />
          <ContextItem
            label="Open in SFTP"
            disabled={!canBrowseRemote}
            onClick={() => {
              handleOpenSftp();
              setContextMenu(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ExplorerHeader({
  pathLabel,
  onRefresh,
  showHidden,
  onToggleShowHidden,
  onOpenSftp,
  openSftpDisabled,
}: {
  pathLabel: string;
  onRefresh?: () => void;
  showHidden: boolean;
  onToggleShowHidden: () => void;
  onOpenSftp?: () => void;
  openSftpDisabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
          Explorer
        </div>
        <div className="truncate text-sm text-[var(--color-text-primary)]" title={pathLabel}>
          {pathLabel || '—'}
        </div>
      </div>

      <button
        type="button"
        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onRefresh}
        disabled={!onRefresh}
        title="Refresh"
      >
        <RefreshCw className="h-4 w-4" />
      </button>

      <button
        type="button"
        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
        onClick={onToggleShowHidden}
        title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
      >
        {showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>

      <button
        type="button"
        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onOpenSftp}
        disabled={openSftpDisabled || !onOpenSftp}
        title="Open in SFTP"
      >
        <FolderTree className="h-4 w-4" />
      </button>
    </div>
  );
}

function ContextItem({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="w-full px-3 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

function buildTreeNodes(
  entries: FileEntry[],
  basePath: string,
  expandedPaths: Set<string>,
  directoryMap: DirectoryMap,
  showHidden: boolean,
  depth = 0,
): TreeNode[] {
  const nodes: TreeNode[] = [];

  for (const entry of entries) {
    const path = joinPath(basePath, entry.name);
    nodes.push({ entry, path, depth });

    if (entry.isDir && expandedPaths.has(path)) {
      nodes.push(...buildTreeNodes(filterEntries(directoryMap[path] ?? [], showHidden), path, expandedPaths, directoryMap, showHidden, depth + 1));
    }
  }

  return nodes;
}

function sortEntries(entries: FileEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.isDir !== right.isDir) {
      return left.isDir ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function joinPath(basePath: string, name: string) {
  if (!basePath || basePath === '.') {
    return name;
  }

  if (basePath === '/') {
    return `/${name}`;
  }

  const separator = basePath.includes('\\') && !basePath.includes('/') ? '\\' : '/';
  return `${basePath.replace(/[\\/]$/, '')}${separator}${name}`;
}

function getParentPath(path: string) {
  if (!path || path === '.' || path === '/') {
    return null;
  }

  if (/^[A-Za-z]:\\?$/.test(path)) {
    return null;
  }

  const separator = path.includes('\\') && !path.includes('/') ? '\\' : '/';
  const parts = path.split(/[\\/]+/).filter(Boolean);

  if (parts.length <= 1) {
    return path.startsWith('/') ? '/' : '.';
  }

  const parent = parts.slice(0, -1).join(separator);
  return path.startsWith('/') ? `/${parent}` : parent;
}

function formatPathLabel(path: string) {
  if (!path) {
    return '';
  }

  if (path === '/') {
    return '/';
  }

  const trimmed = path.replace(/[\\/]$/, '');
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);

  if (parts.length <= 3) {
    return trimmed;
  }

  return `…/${parts.slice(-3).join('/')}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function filterEntries(entries: FileEntry[], showHidden: boolean) {
  if (showHidden) {
    return entries;
  }

  return entries.filter((entry) => !entry.name.startsWith('.'));
}

function isBinaryFile(path: string) {
  const extension = getPathExtension(path);

  return BINARY_FILE_EXTENSIONS.has(extension);
}

function getPathExtension(path: string) {
  const fileName = path.split(/[\\/]/).pop() ?? path;
  const dotIndex = fileName.lastIndexOf('.');

  if (dotIndex === -1) {
    return '';
  }

  return fileName.slice(dotIndex).toLowerCase();
}

const BINARY_FILE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.svg',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
]);
