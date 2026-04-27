import { homeDir } from '@tauri-apps/api/path';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilePane } from './FilePane';
import { TransferQueue } from './TransferQueue';
import { useSFTP } from '../../hooks/useSFTP';
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
  const { jobs, error, isLoading, listDir, listLocalDir, upload, download, mkdir, remove, rename, cancelTransfer } = useSFTP();

  const refreshLocal = useCallback(async (path: string) => {
    const entries = await listLocalDir(path);
    setLocalEntries(entries);
    setLocalSelection([]);
  }, [listLocalDir]);

  const refreshRemote = useCallback(async (path: string) => {
    const entries = await listDir(sessionId, path);
    setRemoteEntries(entries);
    setRemoteSelection([]);
  }, [listDir, sessionId]);

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
        if (event.ctrlKey || event.metaKey) {
          return currentSelection.includes(name)
            ? currentSelection.filter((item) => item !== name)
            : [...currentSelection, name];
        }

        return [name];
      });
    },
    [],
  );

  const toggleSort = useCallback((current: SortState, field: SortField) => {
    if (current.field === field) {
      return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' } satisfies SortState;
    }

    return { field, direction: 'asc' } satisfies SortState;
  }, []);

  const handleUpload = useCallback(() => {
    selectedLocalEntries.forEach((entry) => {
      if (entry.isDir) return;
      upload(sessionId, joinPath(localNav.current, entry.name), joinPath(remoteNav.current, entry.name));
    });
  }, [localNav.current, remoteNav.current, selectedLocalEntries, sessionId, upload]);

  const handleDownload = useCallback(() => {
    selectedRemoteEntries.forEach((entry) => {
      if (entry.isDir) return;
      download(sessionId, joinPath(remoteNav.current, entry.name), joinPath(localNav.current, entry.name));
    });
  }, [download, localNav.current, remoteNav.current, selectedRemoteEntries, sessionId]);

  const handleDelete = useCallback(async () => {
    if (remoteSelection.length === 0) return;

    try {
      for (const name of remoteSelection) {
        await remove(sessionId, joinPath(remoteNav.current, name));
      }
      await refreshRemote(remoteNav.current);
      setBrowserError(null);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Failed to delete remote selection';
      setBrowserError(message);
    }
  }, [refreshRemote, remoteNav.current, remoteSelection, remove, sessionId]);

  const handleNewFolder = useCallback(async () => {
    const input = window.prompt('New remote folder name');
    if (!input) return;

    try {
      await mkdir(sessionId, joinPath(remoteNav.current, input));
      await refreshRemote(remoteNav.current);
      setBrowserError(null);
    } catch (mkdirError) {
      const message = mkdirError instanceof Error ? mkdirError.message : 'Failed to create remote folder';
      setBrowserError(message);
    }
  }, [mkdir, refreshRemote, remoteNav.current, sessionId]);

  const handleRename = useCallback(async () => {
    if (remoteSelection.length !== 1) return;

    const currentName = remoteSelection[0];
    const nextName = window.prompt('Rename remote item', currentName);
    if (!nextName || nextName === currentName) return;

    try {
      await rename(sessionId, joinPath(remoteNav.current, currentName), joinPath(remoteNav.current, nextName));
      await refreshRemote(remoteNav.current);
      setBrowserError(null);
    } catch (renameError) {
      const message = renameError instanceof Error ? renameError.message : 'Failed to rename remote item';
      setBrowserError(message);
    }
  }, [refreshRemote, remoteNav.current, remoteSelection, rename, sessionId]);

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

      <div className="grid flex-1 min-h-0 grid-cols-2 gap-4 p-4 overflow-hidden">
        <div className={`min-h-0 h-full ${activePane === 'local' ? 'ring-1 ring-[var(--color-accent)]' : ''}`}>
          <FilePane
            entries={localEntries}
            isLoading={isLoading && activePane === 'local'}
            history={localNav.history}
            historyIndex={localNav.index}
            onNavigate={(path) => { setActivePane('local'); navigateLocal(path); }}
            onGoBack={() => { setActivePane('local'); goBackLocal(); }}
            onGoForward={() => { setActivePane('local'); goForwardLocal(); }}
            onSelect={(name, event) => handleSelect('local', name, event)}
            onSort={(field) => setLocalSort((current) => toggleSort(current, field))}
            path={localNav.current}
            selectedNames={localSelection}
            sortDirection={localSort.direction}
            sortField={localSort.field}
            title="Local"
          />
        </div>

        <div className={`min-h-0 h-full ${activePane === 'remote' ? 'ring-1 ring-[var(--color-accent)]' : ''}`}>
          <FilePane
            entries={remoteEntries}
            isLoading={isLoading && activePane === 'remote'}
            history={remoteNav.history}
            historyIndex={remoteNav.index}
            onNavigate={(path) => { setActivePane('remote'); navigateRemote(path); }}
            onGoBack={() => { setActivePane('remote'); goBackRemote(); }}
            onGoForward={() => { setActivePane('remote'); goForwardRemote(); }}
            onSelect={(name, event) => handleSelect('remote', name, event)}
            onSort={(field) => setRemoteSort((current) => toggleSort(current, field))}
            path={remoteNav.current}
            selectedNames={remoteSelection}
            sortDirection={remoteSort.direction}
            sortField={remoteSort.field}
            title="Remote"
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
