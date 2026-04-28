import { homeDir } from '@tauri-apps/api/path';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { FilePane } from './FilePane';
import type { ContextAction, PaneTarget } from './FilePane';
import { TransferQueue } from './TransferQueue';
import { useSFTP } from '../../hooks/useSFTP';
import { useTerminalStore } from '../../stores/terminalStore';
import type { FileEntry } from '../../types/sftp';

type PaneKind = 'local' | 'remote';
type SortField = 'name' | 'size' | 'modified';
type SortDirection = 'asc' | 'desc';

interface SortState {
  field: SortField;
  direction: SortDirection;
}

interface Props {
  connectionTitle: string;
  sessionId: string;
}

function useNavHistory(initialPath: string) {
  const [history, setHistory] = useState<string[]>([initialPath]);
  const [index, setIndex] = useState(0);

  const navigate = useCallback((path: string) => {
    setHistory(prev => [...prev.slice(0, index + 1), path]);
    setIndex(prev => prev + 1);
  }, [index]);

  const goBack = useCallback(() => {
    if (index > 0) setIndex(prev => prev - 1);
  }, [index]);

  const goForward = useCallback(() => {
    setIndex(prev => Math.min(prev + 1, history.length - 1));
  }, [history.length]);

  return { current: history[index] ?? initialPath, history, index, navigate, goBack, goForward };
}

export function FileBrowser({ connectionTitle, sessionId }: Props) {
  const { tabs } = useTerminalStore();
  const allTargets = useMemo<PaneTarget[]>(() => {
    const targets: PaneTarget[] = [{ id: 'local', label: 'Local' }];
    targets.push({ id: sessionId, label: `Remote (${connectionTitle})` });
    tabs.forEach((tab) => {
      if (tab.kind === 'terminal' && tab.sessionId && tab.sessionId !== sessionId) {
        targets.push({ id: tab.sessionId, label: `Remote (${tab.title})` });
      }
    });
    return targets;
  }, [connectionTitle, sessionId, tabs]);
  const [leftTargetId, setLeftTargetId] = useState('local');
  const [rightTargetId, setRightTargetId] = useState(sessionId);
  const localNav = useNavHistory('');
  const remoteNav = useNavHistory('.');
  const [localEntries, setLocalEntries] = useState<FileEntry[]>([]);
  const [remoteEntries, setRemoteEntries] = useState<FileEntry[]>([]);
  const [activePane, setActivePane] = useState<PaneKind>('remote');
  const [localSelection, setLocalSelection] = useState<string[]>([]);
  const [remoteSelection, setRemoteSelection] = useState<string[]>([]);
  const [localSort, setLocalSort] = useState<SortState>({ field: 'name', direction: 'asc' });
  const [remoteSort, setRemoteSort] = useState<SortState>({ field: 'name', direction: 'asc' });
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [checkboxMode, setCheckboxMode] = useState(false);
  const [clipboard, setClipboard] = useState<{ pane: string; names: string[] } | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const refreshPendingRef = useRef(false);

  const handleDividerPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;

    const startX = e.clientX;
    const startRatio = splitRatio;
    const containerRect = container.getBoundingClientRect();

    const onMove = (ev: globalThis.PointerEvent) => {
      const delta = ev.clientX - startX;
      const newRatio = Math.min(0.8, Math.max(0.2, startRatio + delta / containerRect.width));
      setSplitRatio(newRatio);
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [splitRatio]);

  const { jobs, error, isLoading, listDir, listLocalDir, upload, download, mkdir, remove, rename, localDelete, localRename, localMkdir, remoteTransfer, cancelTransfer } = useSFTP(() => {
    refreshPendingRef.current = true;
  });

  useEffect(() => {
    const id = setInterval(() => {
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        void refreshLocal(localNav.current);
        void refreshRemote(remoteNav.current);
      }
    }, 500);
    return () => clearInterval(id);
  });

  const refreshLocal = useCallback(async (path: string, overrideTargetId?: string) => {
    const tid = overrideTargetId ?? leftTargetId;
    if (tid === 'local') {
      const entries = await listLocalDir(path);
      setLocalEntries(entries);
    } else {
      const entries = await listDir(tid, path);
      setLocalEntries(entries);
    }
    setLocalSelection([]);
  }, [leftTargetId, listDir, listLocalDir]);

  const refreshRemote = useCallback(async (path: string, overrideSessionId?: string) => {
    const sid = overrideSessionId ?? rightTargetId;
    if (sid === 'local') {
      const entries = await listLocalDir(path);
      setRemoteEntries(entries);
    } else {
      const entries = await listDir(sid, path);
      setRemoteEntries(entries);
    }
    setRemoteSelection([]);
  }, [listDir, listLocalDir, rightTargetId]);

  const navigateLocal = useCallback((path: string) => {
    localNav.navigate(path);
    void refreshLocal(path);
  }, [localNav, refreshLocal]);

  const navigateRemote = useCallback((path: string) => {
    remoteNav.navigate(path);
    void refreshRemote(path);
  }, [remoteNav, refreshRemote]);

  const goBackLocal = useCallback(() => {
    localNav.goBack();
    const prev = localNav.history[localNav.index - 1];
    if (prev) void refreshLocal(prev);
  }, [localNav, refreshLocal]);

  const goForwardLocal = useCallback(() => {
    localNav.goForward();
    const next = localNav.history[localNav.index + 1];
    if (next) void refreshLocal(next);
  }, [localNav, refreshLocal]);

  const goBackRemote = useCallback(() => {
    remoteNav.goBack();
    const prev = remoteNav.history[remoteNav.index - 1];
    if (prev) void refreshRemote(prev);
  }, [remoteNav, refreshRemote]);

  const goForwardRemote = useCallback(() => {
    remoteNav.goForward();
    const next = remoteNav.history[remoteNav.index + 1];
    if (next) void refreshRemote(next);
  }, [remoteNav, refreshRemote]);

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        const initialLocalPath = await homeDir();
        if (!isMounted) return;

        localNav.navigate(initialLocalPath);
        await Promise.all([refreshLocal(initialLocalPath), refreshRemote('.')]);
      } catch (loadError) {
        if (!isMounted) return;

        const message = loadError instanceof Error ? loadError.message : 'Failed to load SFTP browser';
        setBrowserError(message);
      }
    }

    void initialize();
    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedLocalEntries = useMemo(
    () => localEntries.filter((entry) => localSelection.includes(entry.name)),
    [localEntries, localSelection],
  );
  const selectedRemoteEntries = useMemo(
    () => remoteEntries.filter((entry) => remoteSelection.includes(entry.name)),
    [remoteEntries, remoteSelection],
  );

  const handleSelect = useCallback(
    (
      pane: PaneKind,
      name: string,
      event: React.MouseEvent<HTMLButtonElement>,
    ) => {
      setActivePane(pane);

      const setter = pane === 'local' ? setLocalSelection : setRemoteSelection;
      setter((currentSelection) => {
        if (checkboxMode || event.ctrlKey || event.metaKey) {
          return currentSelection.includes(name)
            ? currentSelection.filter((item) => item !== name)
            : [...currentSelection, name];
        }

        return [name];
      });
    },
    [checkboxMode],
  );

  const toggleSort = useCallback((current: SortState, field: SortField) => {
    if (current.field === field) {
      return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' } satisfies SortState;
    }

    return { field, direction: 'asc' } satisfies SortState;
  }, []);

  const leftIsRemote = leftTargetId !== 'local';
  const rightIsRemote = rightTargetId !== 'local';
  const bothRemote = leftIsRemote && rightIsRemote;

  const handleUpload = useCallback(() => {
    selectedLocalEntries.forEach((entry) => {
      if (entry.isDir) return;
      const srcPath = joinPath(localNav.current, entry.name);
      const dstPath = joinPath(remoteNav.current, entry.name);
      if (bothRemote) {
        remoteTransfer(leftTargetId, srcPath, rightTargetId, dstPath);
      } else if (leftIsRemote) {
        download(leftTargetId, srcPath, dstPath);
      } else {
        upload(rightTargetId, srcPath, dstPath);
      }
    });
  }, [bothRemote, download, leftIsRemote, leftTargetId, localNav.current, remoteNav.current, remoteTransfer, rightTargetId, selectedLocalEntries, upload]);

  const handleDownload = useCallback(() => {
    selectedRemoteEntries.forEach((entry) => {
      if (entry.isDir) return;
      const srcPath = joinPath(remoteNav.current, entry.name);
      const dstPath = joinPath(localNav.current, entry.name);
      if (bothRemote) {
        remoteTransfer(rightTargetId, srcPath, leftTargetId, dstPath);
      } else if (rightIsRemote) {
        download(rightTargetId, srcPath, dstPath);
      } else {
        upload(leftTargetId, dstPath, srcPath);
      }
    });
  }, [bothRemote, download, leftTargetId, localNav.current, remoteNav.current, remoteTransfer, rightIsRemote, rightTargetId, selectedRemoteEntries, upload]);

  const handleDelete = useCallback(async () => {
    if (remoteSelection.length === 0) return;

    try {
      for (const name of remoteSelection) {
        const fullPath = joinPath(remoteNav.current, name);
        if (rightIsRemote) {
          await remove(rightTargetId, fullPath);
        } else {
          await localDelete(fullPath);
        }
      }
      await refreshRemote(remoteNav.current);
      setBrowserError(null);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Failed to delete selection';
      setBrowserError(message);
    }
  }, [localDelete, refreshRemote, remoteNav.current, remoteSelection, remove, rightIsRemote, rightTargetId]);

  const handleNewFolder = useCallback(async () => {
    const input = window.prompt('New folder name');
    if (!input) return;

    try {
      const fullPath = joinPath(remoteNav.current, input);
      if (rightIsRemote) {
        await mkdir(rightTargetId, fullPath);
      } else {
        await localMkdir(fullPath);
      }
      await refreshRemote(remoteNav.current);
      setBrowserError(null);
    } catch (mkdirError) {
      const message = mkdirError instanceof Error ? mkdirError.message : 'Failed to create folder';
      setBrowserError(message);
    }
  }, [localMkdir, mkdir, refreshRemote, remoteNav.current, rightIsRemote, rightTargetId]);

  const handleRename = useCallback(async () => {
    if (remoteSelection.length !== 1) return;

    const currentName = remoteSelection[0];
    const nextName = window.prompt('Rename item', currentName);
    if (!nextName || nextName === currentName) return;

    try {
      const oldPath = joinPath(remoteNav.current, currentName);
      const newPath = joinPath(remoteNav.current, nextName);
      if (rightIsRemote) {
        await rename(rightTargetId, oldPath, newPath);
      } else {
        await localRename(oldPath, newPath);
      }
      await refreshRemote(remoteNav.current);
      setBrowserError(null);
    } catch (renameError) {
      const message = renameError instanceof Error ? renameError.message : 'Failed to rename item';
      setBrowserError(message);
    }
  }, [localRename, refreshRemote, remoteNav.current, remoteSelection, rename, rightIsRemote, rightTargetId]);

  const handleDropOnLocal = useCallback((fileNames: string[]) => {
    fileNames.forEach((name) => {
      const remoteEntry = remoteEntries.find((e) => e.name === name);
      if (remoteEntry?.isDir) return;
      const srcPath = joinPath(remoteNav.current, name);
      const dstPath = joinPath(localNav.current, name);
      if (bothRemote) {
        remoteTransfer(rightTargetId, srcPath, leftTargetId, dstPath);
      } else {
        download(rightTargetId, srcPath, dstPath);
      }
    });
  }, [bothRemote, download, leftTargetId, localNav.current, remoteEntries, remoteNav.current, remoteTransfer, rightTargetId]);

  const handleDropOnRemote = useCallback((fileNames: string[]) => {
    fileNames.forEach((name) => {
      const localEntry = localEntries.find((e) => e.name === name);
      if (localEntry?.isDir) return;
      const srcPath = joinPath(localNav.current, name);
      const dstPath = joinPath(remoteNav.current, name);
      if (bothRemote) {
        remoteTransfer(leftTargetId, srcPath, rightTargetId, dstPath);
      } else {
        upload(leftTargetId, srcPath, dstPath);
      }
    });
  }, [bothRemote, leftTargetId, localEntries, localNav.current, remoteNav.current, remoteTransfer, rightTargetId, upload]);

  const handleLocalContextAction = useCallback(async (action: ContextAction, targetName?: string | null) => {
    try {
      if (action === 'toggle-select' && targetName) {
        setCheckboxMode(true);
        setLocalSelection((prev) =>
          prev.includes(targetName) ? prev.filter((n) => n !== targetName) : [...prev, targetName]
        );
        return;
      }
      if (action === 'deselect-all') {
        setLocalSelection([]);
        return;
      }
      if (action === 'delete') {
        if (!window.confirm(`Delete ${localSelection.length} item(s)?`)) return;
        for (const name of localSelection) {
          const fullPath = joinPath(localNav.current, name);
          if (leftIsRemote) {
            await remove(leftTargetId, fullPath);
          } else {
            await localDelete(fullPath);
          }
        }
        await refreshLocal(localNav.current);
      } else if (action === 'rename') {
        if (localSelection.length !== 1) return;
        const next = window.prompt('Rename', localSelection[0]);
        if (!next || next === localSelection[0]) return;
        const oldPath = joinPath(localNav.current, localSelection[0]);
        const newPath = joinPath(localNav.current, next);
        if (leftIsRemote) {
          await rename(leftTargetId, oldPath, newPath);
        } else {
          await localRename(oldPath, newPath);
        }
        await refreshLocal(localNav.current);
      } else if (action === 'new-folder') {
        const name = window.prompt('New folder name');
        if (!name) return;
        const fullPath = joinPath(localNav.current, name);
        if (leftIsRemote) {
          await mkdir(leftTargetId, fullPath);
        } else {
          await localMkdir(fullPath);
        }
        await refreshLocal(localNav.current);
      } else if (action === 'copy') {
        setClipboard({ pane: 'local', names: [...localSelection] });
      } else if (action === 'paste' && clipboard && clipboard.pane === 'remote') {
        clipboard.names.forEach((name) => {
          const srcPath = joinPath(remoteNav.current, name);
          const dstPath = joinPath(localNav.current, name);
          if (bothRemote) {
            remoteTransfer(rightTargetId, srcPath, leftTargetId, dstPath);
          } else if (leftIsRemote) {
            remoteTransfer(rightTargetId, srcPath, leftTargetId, dstPath);
          } else {
            download(rightTargetId, srcPath, dstPath);
          }
        });
      } else if (action === 'upload') {
        localSelection.forEach((name) => {
          const entry = localEntries.find((e) => e.name === name);
          if (entry?.isDir) return;
          const srcPath = joinPath(localNav.current, name);
          const dstPath = joinPath(remoteNav.current, name);
          if (bothRemote) {
            remoteTransfer(leftTargetId, srcPath, rightTargetId, dstPath);
          } else {
            upload(rightTargetId, srcPath, dstPath);
          }
        });
      } else if (action === 'refresh') {
        await refreshLocal(localNav.current);
      }
      setBrowserError(null);
    } catch (e) {
      setBrowserError(e instanceof Error ? e.message : 'Operation failed');
    }
  }, [bothRemote, clipboard, download, leftIsRemote, leftTargetId, localDelete, localEntries, localMkdir, localNav.current, localRename, localSelection, mkdir, refreshLocal, remoteNav.current, remoteTransfer, remove, rename, rightTargetId, upload]);

  const handleRemoteContextAction = useCallback(async (action: ContextAction, targetName?: string | null) => {
    try {
      if (action === 'toggle-select' && targetName) {
        setCheckboxMode(true);
        setRemoteSelection((prev) =>
          prev.includes(targetName) ? prev.filter((n) => n !== targetName) : [...prev, targetName]
        );
        return;
      }
      if (action === 'deselect-all') {
        setRemoteSelection([]);
        return;
      }
      if (action === 'delete') {
        if (!window.confirm(`Delete ${remoteSelection.length} item(s)?`)) return;
        for (const name of remoteSelection) {
          const fullPath = joinPath(remoteNav.current, name);
          if (rightIsRemote) {
            await remove(rightTargetId, fullPath);
          } else {
            await localDelete(fullPath);
          }
        }
        await refreshRemote(remoteNav.current);
      } else if (action === 'rename') {
        if (remoteSelection.length !== 1) return;
        const next = window.prompt('Rename', remoteSelection[0]);
        if (!next || next === remoteSelection[0]) return;
        const oldPath = joinPath(remoteNav.current, remoteSelection[0]);
        const newPath = joinPath(remoteNav.current, next);
        if (rightIsRemote) {
          await rename(rightTargetId, oldPath, newPath);
        } else {
          await localRename(oldPath, newPath);
        }
        await refreshRemote(remoteNav.current);
      } else if (action === 'new-folder') {
        const name = window.prompt('New folder name');
        if (!name) return;
        const fullPath = joinPath(remoteNav.current, name);
        if (rightIsRemote) {
          await mkdir(rightTargetId, fullPath);
        } else {
          await localMkdir(fullPath);
        }
        await refreshRemote(remoteNav.current);
      } else if (action === 'copy') {
        setClipboard({ pane: 'remote', names: [...remoteSelection] });
      } else if (action === 'paste' && clipboard && clipboard.pane === 'local') {
        clipboard.names.forEach((name) => {
          const srcPath = joinPath(localNav.current, name);
          const dstPath = joinPath(remoteNav.current, name);
          if (bothRemote) {
            remoteTransfer(leftTargetId, srcPath, rightTargetId, dstPath);
          } else if (rightIsRemote) {
            upload(rightTargetId, srcPath, dstPath);
          } else {
            remoteTransfer(leftTargetId, srcPath, rightTargetId, dstPath);
          }
        });
      } else if (action === 'download') {
        remoteSelection.forEach((name) => {
          const entry = remoteEntries.find((e) => e.name === name);
          if (entry?.isDir) return;
          const srcPath = joinPath(remoteNav.current, name);
          const dstPath = joinPath(localNav.current, name);
          if (bothRemote) {
            remoteTransfer(rightTargetId, srcPath, leftTargetId, dstPath);
          } else {
            download(rightTargetId, srcPath, dstPath);
          }
        });
      } else if (action === 'refresh') {
        await refreshRemote(remoteNav.current);
      }
      setBrowserError(null);
    } catch (e) {
      setBrowserError(e instanceof Error ? e.message : 'Operation failed');
    }
  }, [bothRemote, clipboard, download, leftTargetId, localDelete, localMkdir, localNav.current, localRename, mkdir, refreshRemote, remoteEntries, remoteNav.current, remoteSelection, remoteTransfer, remove, rename, rightIsRemote, rightTargetId, upload]);

  const toolbarDisabled = useMemo(
    () => ({
      upload: selectedLocalEntries.every((entry) => entry.isDir) || selectedLocalEntries.length === 0,
      download: selectedRemoteEntries.every((entry) => entry.isDir) || selectedRemoteEntries.length === 0,
      delete: remoteSelection.length === 0,
      rename: remoteSelection.length !== 1,
    }),
    [remoteSelection.length, selectedLocalEntries, selectedRemoteEntries],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="text-sm font-medium text-[var(--color-text-primary)]">{connectionTitle} · SFTP</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ToolbarButton disabled={toolbarDisabled.upload} icon={<ArrowUpFromLine className="h-4 w-4" />} label="Upload" onClick={handleUpload} />
          <ToolbarButton disabled={toolbarDisabled.download} icon={<ArrowDownToLine className="h-4 w-4" />} label="Download" onClick={handleDownload} />
          <ToolbarButton disabled={toolbarDisabled.delete} icon={<Trash2 className="h-4 w-4" />} label="Delete" onClick={() => void handleDelete()} />
          <ToolbarButton icon={<FolderPlus className="h-4 w-4" />} label="New Folder" onClick={() => void handleNewFolder()} />
          <ToolbarButton disabled={toolbarDisabled.rename} icon={<Pencil className="h-4 w-4" />} label="Rename" onClick={() => void handleRename()} />
          <ToolbarButton icon={<RefreshCw className="h-4 w-4" />} label="Refresh" onClick={() => {
            void refreshLocal(localNav.current);
            void refreshRemote(remoteNav.current);
          }} />
        </div>
      </div>

      {(browserError || error) && (
        <div className="border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-error)_10%,var(--color-bg-secondary))] px-4 py-3 text-sm text-[var(--color-error)]">
          {browserError ?? error}
        </div>
      )}

      <div ref={splitContainerRef} className="flex flex-1 min-h-0 p-4 gap-0 overflow-hidden">
        <div className={`min-h-0 h-full ${activePane === 'local' ? 'ring-1 ring-[var(--color-accent)]' : ''}`} style={{ width: `${splitRatio * 100}%` }}>
          <FilePane
            entries={localEntries}
            isLoading={isLoading && activePane === 'local'}
            checkboxMode={checkboxMode}
            clipboardPane={clipboard?.pane ?? null}
            clipboardNames={clipboard?.names ?? []}
            history={localNav.history}
            historyIndex={localNav.index}
            onNavigate={(path) => { setActivePane('local'); navigateLocal(path); }}
            onGoBack={() => { setActivePane('local'); goBackLocal(); }}
            onGoForward={() => { setActivePane('local'); goForwardLocal(); }}
            onSelect={(name, event) => handleSelect('local', name, event)}
            onSort={(field) => setLocalSort((current) => toggleSort(current, field))}
            onDrop={handleDropOnLocal}
            onContextAction={(action, targetName) => void handleLocalContextAction(action, targetName)}
            onSelectAll={() => { setLocalSelection(localEntries.filter((e) => !e.name.startsWith('.')).map((e) => e.name)); setCheckboxMode(true); }}
            onDeselectAll={() => { setLocalSelection([]); }}
            onToggleCheckboxMode={() => { setCheckboxMode((v) => !v); if (checkboxMode) setLocalSelection([]); }}
            currentTargetId={leftTargetId}
            availableTargets={allTargets}
            onSwitchTarget={(newTarget) => {
              setLeftTargetId(newTarget);
              const startPath = newTarget === 'local' ? '' : '.';
              localNav.navigate(startPath);
              setLocalEntries([]);
              setLocalSelection([]);
              void refreshLocal(startPath, newTarget);
            }}
            paneId="local"
            path={localNav.current}
            selectedNames={localSelection}
            sortDirection={localSort.direction}
            sortField={localSort.field}
            title="Local"
          />
        </div>

        <div
          className="shrink-0 w-2 cursor-col-resize flex items-center justify-center group"
          onPointerDown={handleDividerPointerDown}
        >
          <div className="w-0.5 h-8 rounded-full bg-[var(--color-border)] group-hover:bg-[var(--color-accent)] transition-colors" />
        </div>

        <div className={`min-h-0 h-full flex-1 ${activePane === 'remote' ? 'ring-1 ring-[var(--color-accent)]' : ''}`}>
          <FilePane
            entries={remoteEntries}
            isLoading={isLoading && activePane === 'remote'}
            checkboxMode={checkboxMode}
            clipboardPane={clipboard?.pane ?? null}
            clipboardNames={clipboard?.names ?? []}
            history={remoteNav.history}
            historyIndex={remoteNav.index}
            onNavigate={(path) => { setActivePane('remote'); navigateRemote(path); }}
            onGoBack={() => { setActivePane('remote'); goBackRemote(); }}
            onGoForward={() => { setActivePane('remote'); goForwardRemote(); }}
            onSelect={(name, event) => handleSelect('remote', name, event)}
            onSort={(field) => setRemoteSort((current) => toggleSort(current, field))}
            onDrop={handleDropOnRemote}
            onContextAction={(action, targetName) => void handleRemoteContextAction(action, targetName)}
            onSelectAll={() => { setRemoteSelection(remoteEntries.filter((e) => !e.name.startsWith('.')).map((e) => e.name)); setCheckboxMode(true); }}
            onDeselectAll={() => { setRemoteSelection([]); }}
            onToggleCheckboxMode={() => { setCheckboxMode((v) => !v); if (checkboxMode) setRemoteSelection([]); }}
            currentTargetId={rightTargetId}
            availableTargets={allTargets}
            onSwitchTarget={(newTarget) => {
              setRightTargetId(newTarget);
              const startPath = newTarget === 'local' ? '' : '.';
              remoteNav.navigate(startPath);
              setRemoteEntries([]);
              setRemoteSelection([]);
              void refreshRemote(startPath, newTarget);
            }}
            paneId="remote"
            path={remoteNav.current}
            selectedNames={remoteSelection}
            sortDirection={remoteSort.direction}
            sortField={remoteSort.field}
            title={`Remote (${connectionTitle})`}
          />
        </div>
      </div>

      <TransferQueue jobs={jobs} onCancel={cancelTransfer} />
    </div>
  );
}

function ToolbarButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function joinPath(basePath: string, name: string) {
  if (!basePath || basePath === '.') {
    return name;
  }

  if (basePath.endsWith('/') || basePath.endsWith('\\')) {
    return `${basePath}${name}`;
  }

  const separator = basePath.includes('\\') && !basePath.includes('/') ? '\\' : '/';
  return `${basePath}${separator}${name}`;
}
