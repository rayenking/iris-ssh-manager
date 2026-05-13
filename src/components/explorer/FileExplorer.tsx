import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { ChevronRight, Eye, EyeOff, FolderTree, RefreshCw, Terminal, FilePlus, FolderPlus, Copy, ClipboardPaste, Pencil, Trash2, FileText, ExternalLink } from 'lucide-react';
import { FileEntryIcon } from '../file-icons/FileEntryIcon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tauriApi } from '../../lib/tauri';
import { useTerminalStore } from '../../stores/terminalStore';
import { useUiStore } from '../../stores/uiStore';
import { getPrimaryPaneId, useSplitStore } from '../../stores/splitStore';
import type { FileEntry } from '../../types/sftp';

interface TreeNode {
  entry: FileEntry;
  path: string;
  depth: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: TreeNode | null;
  folderPath: string;
}

type DirectoryMap = Record<string, FileEntry[]>;

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function FileExplorer() {
  const { activeTabId, tabs, openFileBrowserTab } = useTerminalStore();
  const setEditorFile = useUiStore((state) => state.setEditorFile);
  const splitTree = useSplitStore((state) => (activeTabId ? state.splitTrees[activeTabId] ?? null : null));
  const focusedPaneId = useSplitStore((state) => (activeTabId ? state.focusedPaneIdByTabId[activeTabId] ?? null : null));
  const paneRuntimeById = useSplitStore((state) => state.paneRuntimeById);
  const setPaneCwd = useSplitStore((state) => state.setPaneCwd);
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const resolvedPaneId = activeTabId
    ? focusedPaneId ?? (splitTree ? getPrimaryPaneId(splitTree) : activeTabId)
    : null;
  const activePaneRuntime = resolvedPaneId ? paneRuntimeById[resolvedPaneId] ?? null : null;
  const activePaneConnectionId = activePaneRuntime?.connectionId ?? activeTab?.connectionId ?? null;
  const activePaneSessionId = activePaneRuntime?.sessionId ?? (activeTab?.kind === 'terminal' || activeTab?.kind === 'local-terminal' ? activeTab.sessionId : undefined);
  const activePaneKind = activePaneConnectionId === 'local' ? 'local-terminal' : activePaneConnectionId ? 'terminal' : activeTab?.kind ?? null;
  const activeCwd = activePaneRuntime?.cwd ?? (activePaneKind === 'terminal' ? '.' : activePaneKind === 'local-terminal' ? '' : '');
  const [directoryMap, setDirectoryMap] = useState<DirectoryMap>({});
  const directoryMapRef = useRef<DirectoryMap>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [clipboardPath, setClipboardPath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creatingIn, setCreatingIn] = useState<{ folder: string; type: 'file' | 'folder' } | null>(null);
  const [createName, setCreateName] = useState('');
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const hasTerminalTab = activePaneKind === 'terminal' || activePaneKind === 'local-terminal';
  const canBrowseRemote = activePaneKind === 'terminal' && Boolean(activePaneSessionId);
  const canBrowseLocal = activePaneKind === 'local-terminal';
  const canBrowse = canBrowseRemote || canBrowseLocal;

  const listDirectory = useCallback(async (path: string) => {
    if (!activePaneKind) {
      return [] as FileEntry[];
    }

    if (activePaneKind === 'local-terminal') {
      return tauriApi.localListDir(path);
    }

    if (activePaneKind === 'terminal' && activePaneSessionId) {
      return tauriApi.sftpListDir(activePaneSessionId, path);
    }

    return [] as FileEntry[];
  }, [activePaneKind, activePaneSessionId]);

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

      if ((root === '.' || root === '') && canBrowseRemote && activePaneSessionId) {
        try {
          const resolved = await tauriApi.sftpRealpath(activePaneSessionId, '.');
          if (resolved && resolved !== '.') {
            root = resolved;
            if (resolvedPaneId) setPaneCwd(resolvedPaneId, resolved);
          }
        } catch {}
      }

      if ((root === '' || root === '.') && canBrowseLocal && activePaneSessionId) {
        try {
          const resolved = await tauriApi.localShellCwd(activePaneSessionId);
          if (resolved) {
            root = resolved;
            if (resolvedPaneId) setPaneCwd(resolvedPaneId, resolved);
          }
        } catch {
          root = '';
        }
      } else if ((root === '' || root === '.') && canBrowseLocal) {
        root = '';
      }

      void loadDirectory(root, true);
    };

    void resolveAndLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCwd, activePaneSessionId, canBrowse, canBrowseLocal, canBrowseRemote, loadDirectory, resolvedPaneId, setPaneCwd]);

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

    if (activePaneKind === 'local-terminal') {
      setEditorFile({ path, isLocal: true, sessionId: activePaneSessionId });
      return;
    }

    if (activePaneKind === 'terminal' && activePaneSessionId) {
      setEditorFile({ path, isLocal: false, sessionId: activePaneSessionId });
      return;
    }

    await handleCopyPath(path);
  }, [activePaneKind, activePaneSessionId, handleCopyPath, setEditorFile]);

  const handleCdToPath = useCallback(async (path: string) => {
    if (!resolvedPaneId || !activePaneKind || !activePaneSessionId) {
      return;
    }

    const command = `cd ${shellEscape(path)}\n`;
    const data = Array.from(new TextEncoder().encode(command));

    try {
      if (activePaneKind === 'local-terminal') {
        await tauriApi.localShellWrite(activePaneSessionId, data);
        setPaneCwd(resolvedPaneId, path);
        return;
      }

      if (activePaneKind === 'terminal') {
        await tauriApi.sshWrite(activePaneSessionId, data);
        setPaneCwd(resolvedPaneId, path);
      }
    } catch (writeError) {
      const message = writeError instanceof Error ? writeError.message : 'Failed to change directory';
      setError(message);
    }
  }, [activePaneKind, activePaneSessionId, resolvedPaneId, setPaneCwd]);

  const handleOpenSftp = useCallback(() => {
    if (!activeTab || activePaneKind !== 'terminal') {
      return;
    }

    openFileBrowserTab(activeTab.id, activePaneConnectionId ?? activeTab.connectionId, activeTab.title);
  }, [activePaneConnectionId, activePaneKind, activeTab, openFileBrowserTab]);

  const rootKey = activeCwd || (activePaneKind === 'local-terminal' ? '' : '.');

  const handleRevealInFinder = useCallback(async (path: string) => {
    try {
      await tauriApi.revealInFileManager(path);
    } catch {}
  }, []);

  const handleNewFile = useCallback(async (folderPath: string, name: string) => {
    if (!name) return;
    const filePath = joinPath(folderPath, name);
    try {
      if (activePaneKind === 'local-terminal') {
        await tauriApi.localWriteFile(filePath, '');
      } else if (activePaneKind === 'terminal' && activePaneSessionId) {
        await tauriApi.sftpWriteFile(activePaneSessionId, filePath, '');
      }
      await loadDirectory(folderPath, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create file');
    }
  }, [activePaneKind, activePaneSessionId, loadDirectory]);

  const handleNewFolder = useCallback(async (folderPath: string, name: string) => {
    if (!name) return;
    const dirPath = joinPath(folderPath, name);
    try {
      if (activePaneKind === 'local-terminal') {
        await tauriApi.localMkdir(dirPath);
      } else if (activePaneKind === 'terminal' && activePaneSessionId) {
        await tauriApi.sftpMkdir(activePaneSessionId, dirPath);
      }
      await loadDirectory(folderPath, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    }
  }, [activePaneKind, activePaneSessionId, loadDirectory]);

  const handleRename = useCallback(async (oldPath: string, newName: string) => {
    if (!newName) return;
    const parent = getParentPath(oldPath) || rootKey;
    const newPath = joinPath(parent, newName);
    try {
      if (activePaneKind === 'local-terminal') {
        await tauriApi.localRename(oldPath, newPath);
      } else if (activePaneKind === 'terminal' && activePaneSessionId) {
        await tauriApi.sftpRename(activePaneSessionId, oldPath, newPath);
      }
      await loadDirectory(parent, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
    }
    setRenamingPath(null);
  }, [activePaneKind, activePaneSessionId, loadDirectory, rootKey]);

  const handleDelete = useCallback(async (path: string) => {
    const parent = getParentPath(path) || rootKey;
    try {
      if (activePaneKind === 'local-terminal') {
        await tauriApi.localDelete(path);
      } else if (activePaneKind === 'terminal' && activePaneSessionId) {
        await tauriApi.sftpDelete(activePaneSessionId, path);
      }
      await loadDirectory(parent, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }, [activePaneKind, activePaneSessionId, loadDirectory, rootKey]);

  const handlePaste = useCallback(async (destFolder: string) => {
    if (!clipboardPath) return;
    const fileName = clipboardPath.split(/[\\/]/).pop() || '';
    const destPath = joinPath(destFolder, fileName);
    try {
      if (activePaneKind === 'local-terminal') {
        await tauriApi.localCopyFile(clipboardPath, destPath);
      } else if (activePaneKind === 'terminal' && activePaneSessionId) {
        const content = await tauriApi.sftpReadFile(activePaneSessionId, clipboardPath);
        await tauriApi.sftpWriteFile(activePaneSessionId, destPath, content);
      }
      await loadDirectory(destFolder, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to paste');
    }
    setClipboardPath(null);
  }, [activePaneKind, activePaneSessionId, clipboardPath, loadDirectory]);

  const handleCopyRelativePath = useCallback(async (path: string) => {
    const root = rootKey;
    let relative = path;
    if (root && root !== '.' && path.startsWith(root)) {
      relative = path.slice(root.length).replace(/^[\\/]/, '');
    }
    try {
      if (isTauriRuntime()) {
        await writeText(relative);
      } else {
        await navigator.clipboard.writeText(relative);
      }
    } catch {}
  }, [rootKey]);

  const handleContextMenu = useCallback((event: React.MouseEvent, node: TreeNode | null) => {
    event.preventDefault();
    event.stopPropagation();
    const folderPath = node
      ? (node.entry.isDir ? node.path : getParentPath(node.path) || rootKey)
      : rootKey;
    setContextMenu({ x: event.clientX, y: event.clientY, node, folderPath });
  }, [rootKey]);

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
        <div className="flex-1 overflow-y-auto" onContextMenu={(event) => handleContextMenu(event, null)}>
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
            const isRenaming = renamingPath === node.path;

            return (
              <div key={node.path}>
                <div
                  className="group flex items-center gap-1 pr-2 select-none cursor-default hover:bg-[var(--color-hover)]"
                  onContextMenu={(event) => handleContextMenu(event, node)}
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

                  {isRenaming ? (
                    <input
                      autoFocus
                      className="min-w-0 flex-1 rounded border border-[var(--color-accent)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] outline-none"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { void handleRename(node.path, renameValue); }
                        if (e.key === 'Escape') { setRenamingPath(null); }
                      }}
                      onBlur={() => setRenamingPath(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left cursor-default"
                      onClick={() => {
                        if (node.entry.isDir) {
                          void handleToggleExpand(node.path);
                          return;
                        }
                        void handleOpenFile(node.path);
                      }}
                      onDoubleClick={() => {
                        if (node.entry.isDir) {
                          void handleCdToPath(node.path);
                        }
                      }}
                      onContextMenu={(event) => handleContextMenu(event, node)}
                      title={node.path}
                    >
                      <FileEntryIcon name={node.entry.name} isDir={node.entry.isDir} fullPath={node.path} className="h-4 w-4" />
                      <span className="truncate text-xs text-[var(--color-text-primary)]">{node.entry.name}</span>
                    </button>
                  )}

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

                {creatingIn && creatingIn.folder === node.path && node.entry.isDir && isExpanded && (
                  <div className="flex items-center gap-1 pr-2" style={{ paddingLeft: 10 + (node.depth + 1) * 14 }}>
                    <span className="w-4 shrink-0" />
                    {creatingIn.type === 'folder' ? (
                      <FolderPlus className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                    ) : (
                      <FilePlus className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                    )}
                    <input
                      autoFocus
                      className="min-w-0 flex-1 rounded border border-[var(--color-accent)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] outline-none"
                      placeholder={creatingIn.type === 'file' ? 'filename' : 'folder name'}
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && createName) {
                          if (creatingIn.type === 'file') void handleNewFile(creatingIn.folder, createName);
                          else void handleNewFolder(creatingIn.folder, createName);
                          setCreatingIn(null);
                        }
                        if (e.key === 'Escape') setCreatingIn(null);
                      }}
                      onBlur={() => setCreatingIn(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {creatingIn && creatingIn.folder === rootKey && (
            <div className="flex items-center gap-1 px-3 pr-2">
              <span className="w-4 shrink-0" />
              {creatingIn.type === 'folder' ? (
                <FolderPlus className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
              ) : (
                <FilePlus className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-primary)]" />
              )}
              <input
                autoFocus
                className="min-w-0 flex-1 rounded border border-[var(--color-accent)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] outline-none"
                placeholder={creatingIn.type === 'file' ? 'filename' : 'folder name'}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && createName) {
                    if (creatingIn.type === 'file') void handleNewFile(creatingIn.folder, createName);
                    else void handleNewFolder(creatingIn.folder, createName);
                    setCreatingIn(null);
                  }
                  if (e.key === 'Escape') setCreatingIn(null);
                }}
                onBlur={() => setCreatingIn(null)}
              />
            </div>
          )}

          {!loadingPath && rootEntries.length === 0 && !creatingIn && (
            <div className="px-3 py-4 text-sm text-[var(--color-text-muted)]">This directory is empty.</div>
          )}
        </div>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[180px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.node && !contextMenu.node.entry.isDir && (
            <>
              <ContextMenuItem icon={<FileText className="h-3.5 w-3.5" />} label="Open" onClick={() => {
                void handleOpenFile(contextMenu.node!.path);
                setContextMenu(null);
              }} />
              <ContextMenuItem icon={<Pencil className="h-3.5 w-3.5" />} label="Rename" onClick={() => {
                setRenamingPath(contextMenu.node!.path);
                setRenameValue(contextMenu.node!.entry.name);
                setContextMenu(null);
              }} />
              <ContextMenuItem icon={<Copy className="h-3.5 w-3.5" />} label="Copy" onClick={() => {
                setClipboardPath(contextMenu.node!.path);
                setContextMenu(null);
              }} />
              <ContextMenuItem icon={<ClipboardPaste className="h-3.5 w-3.5" />} label="Paste" disabled={!clipboardPath} onClick={() => {
                void handlePaste(contextMenu.folderPath);
                setContextMenu(null);
              }} />
              <div className="my-1 border-t border-[var(--color-border)]" />
            </>
          )}
          {contextMenu.node?.entry.isDir && (
            <>
              <ContextMenuItem icon={<Terminal className="h-3.5 w-3.5" />} label="Open in Terminal" onClick={() => {
                void handleCdToPath(contextMenu.node!.path);
                setContextMenu(null);
              }} />
              <ContextMenuItem icon={<ClipboardPaste className="h-3.5 w-3.5" />} label="Paste" disabled={!clipboardPath} onClick={() => {
                void handlePaste(contextMenu.node!.path);
                setContextMenu(null);
              }} />
            </>
          )}
          {!contextMenu.node && (
            <>
              <ContextMenuItem icon={<Terminal className="h-3.5 w-3.5" />} label="Open in Terminal" onClick={() => {
                void handleCdToPath(contextMenu.folderPath);
                setContextMenu(null);
              }} />
              <ContextMenuItem icon={<ClipboardPaste className="h-3.5 w-3.5" />} label="Paste" disabled={!clipboardPath} onClick={() => {
                void handlePaste(contextMenu.folderPath);
                setContextMenu(null);
              }} />
            </>
          )}
          {activePaneKind === 'local-terminal' && (
            <ContextMenuItem icon={<ExternalLink className="h-3.5 w-3.5" />} label="Reveal in Finder" onClick={() => {
              void handleRevealInFinder(contextMenu.node?.entry.isDir ? contextMenu.node.path : contextMenu.folderPath);
              setContextMenu(null);
            }} />
          )}
          <ContextMenuItem icon={<FilePlus className="h-3.5 w-3.5" />} label="New File" onClick={() => {
            setCreatingIn({ folder: contextMenu.folderPath, type: 'file' });
            setCreateName('');
            setContextMenu(null);
          }} />
          <ContextMenuItem icon={<FolderPlus className="h-3.5 w-3.5" />} label="New Folder" onClick={() => {
            setCreatingIn({ folder: contextMenu.folderPath, type: 'folder' });
            setCreateName('');
            setContextMenu(null);
          }} />
          <div className="my-1 border-t border-[var(--color-border)]" />
          <ContextMenuItem icon={<Copy className="h-3.5 w-3.5" />} label="Copy Path" onClick={() => {
            void handleCopyPath(contextMenu.node?.path ?? contextMenu.folderPath);
            setContextMenu(null);
          }} />
          {contextMenu.node && !contextMenu.node.entry.isDir && (
            <ContextMenuItem icon={<Copy className="h-3.5 w-3.5" />} label="Copy Relative Path" onClick={() => {
              void handleCopyRelativePath(contextMenu.node!.path);
              setContextMenu(null);
            }} />
          )}
          <ContextMenuItem icon={<RefreshCw className="h-3.5 w-3.5" />} label="Refresh" onClick={() => {
            void loadDirectory(contextMenu.folderPath, true);
            setContextMenu(null);
          }} />
          {contextMenu.node && !contextMenu.node.entry.isDir && (
            <>
              <div className="my-1 border-t border-[var(--color-border)]" />
              <ContextMenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" danger onClick={() => {
                void handleDelete(contextMenu.node!.path);
                setContextMenu(null);
              }} />
            </>
          )}
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

function ContextMenuItem({ icon, label, onClick, disabled = false, danger = false }: { icon?: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span className="text-[var(--color-text-muted)]">{icon}</span>}
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
