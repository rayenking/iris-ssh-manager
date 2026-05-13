import { AlertCircle, FileCode2, GitBranch, Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { tauriApi } from '../../lib/tauri';
import { useSplitStore } from '../../stores/splitStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useUiStore } from '../../stores/uiStore';
import type { GitStatusResponse } from '../../types/git';
import type { AppTab, LocalTerminalTab, TerminalTab } from '../../types/terminal';
import { FileEntryIcon } from '../file-icons/FileEntryIcon';

type TerminalContextTab = LocalTerminalTab | TerminalTab;

function isTerminalContextTab(tab: AppTab | null | undefined): tab is TerminalContextTab {
  return tab?.kind === 'terminal' || tab?.kind === 'local-terminal';
}

function resolveContextTab(activeTab: AppTab | null, tabs: AppTab[]) {
  if (activeTab?.kind === 'files' || activeTab?.kind === 'review-diff') {
    return tabs.find((tab): tab is TerminalContextTab => isTerminalContextTab(tab) && tab.id === activeTab.terminalTabId) ?? null;
  }

  return isTerminalContextTab(activeTab) ? activeTab : null;
}

function getStatusClass(status: string) {
  switch (status) {
    case 'A':
      return 'text-[var(--color-success)]';
    case 'D':
      return 'text-[var(--color-error)]';
    case 'R':
    case 'C':
      return 'text-[var(--color-accent)]';
    case '??':
      return 'text-[var(--color-warning)]';
    default:
      return 'text-[var(--color-text-secondary)]';
  }
}

function splitFilePath(path: string) {
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash === -1) {
    return { name: normalized, parent: '' };
  }

  return {
    name: normalized.slice(lastSlash + 1),
    parent: normalized.slice(0, lastSlash),
  };
}

function getFolderName(path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

function formatDiffCount(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }

  return value.toString();
}

function getReviewSubtitle(statusData: GitStatusResponse | null, currentCwd: string) {
  const source = statusData?.repoRoot || currentCwd;
  if (!source) {
    return 'No repo selected';
  }

  return getFolderName(source);
}

function getBranchLabel(statusData: GitStatusResponse | null) {
  return statusData?.branch || 'working-tree';
}

function getChangedCount(statusData: GitStatusResponse | null) {
  return statusData?.files.length ?? 0;
}

function getCountBadgeClass(count: number) {
  return count > 0
    ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
    : 'bg-[var(--color-hover)] text-[var(--color-text-muted)]';
}

function getAddedSummary(statusData: GitStatusResponse | null) {
  return `+${formatDiffCount(statusData?.addedLines ?? 0)}`;
}

function getRemovedSummary(statusData: GitStatusResponse | null) {
  return `-${formatDiffCount(statusData?.removedLines ?? 0)}`;
}

export function CodeReviewPanel() {
  const activeTabId = useTerminalStore((state) => state.activeTabId);
  const tabs = useTerminalStore((state) => state.tabs);
  const codeReviewSourceTabId = useUiStore((state) => state.codeReviewSourceTabId);
  const setCodeReviewOpen = useUiStore((state) => state.setCodeReviewOpen);
  const setReviewDiffFile = useUiStore((state) => state.setReviewDiffFile);
  const reviewDiffFile = useUiStore((state) => state.reviewDiffFile);
  const focusedPaneIdByTabId = useSplitStore((state) => state.focusedPaneIdByTabId);
  const paneRuntimeById = useSplitStore((state) => state.paneRuntimeById);

  const [statusData, setStatusData] = useState<GitStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const sourceTab = codeReviewSourceTabId ? (tabs.find((tab) => tab.id === codeReviewSourceTabId) ?? null) : null;
  const contextTab = resolveContextTab(sourceTab ?? activeTab, tabs);
  const focusedPaneId = contextTab ? (focusedPaneIdByTabId[contextTab.id] ?? contextTab.id) : null;
  const activePaneRuntime = focusedPaneId ? (paneRuntimeById[focusedPaneId] ?? null) : null;
  const isLocalContext = contextTab?.kind === 'local-terminal';
  const currentCwd = activePaneRuntime?.cwd?.trim() ?? '';

  useEffect(() => {
    let cancelled = false;

    if (!isLocalContext) {
      setStatusData(null);
      setReviewDiffFile(null);
      setError(contextTab ? 'Code Review v1 hanya tersedia untuk Local Terminal.' : 'Buka Local Terminal di repo git untuk memakai Code Review.');
      return () => {
        cancelled = true;
      };
    }

    if (!currentCwd) {
      setStatusData(null);
      setReviewDiffFile(null);
      setError('Menunggu path folder aktif dari Local Terminal...');
      return () => {
        cancelled = true;
      };
    }

    const loadStatus = async () => {
      setLoadingStatus(true);
      setError(null);

      try {
        const repoRoot = await tauriApi.getGitRepoRoot(currentCwd);
        if (!repoRoot) {
          if (!cancelled) {
            setStatusData(null);
            setReviewDiffFile(null);
            setError('Folder aktif ini bukan repo git.');
          }
          return;
        }

        const nextStatus = await tauriApi.getGitStatus(repoRoot);
        if (!cancelled) {
          setStatusData(nextStatus);
          const stillExists = reviewDiffFile?.path && nextStatus.files.some((file) => file.path === reviewDiffFile.path);
          if (!stillExists) {
            setReviewDiffFile(null);
          }
        }
      } catch (nextError) {
        if (!cancelled) {
          setStatusData(null);
          setReviewDiffFile(null);
          setError(nextError instanceof Error ? nextError.message : 'Gagal membaca git status.');
        }
      } finally {
        if (!cancelled) {
          setLoadingStatus(false);
        }
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [contextTab, currentCwd, isLocalContext, reviewDiffFile?.path, setReviewDiffFile]);

  const handleRefresh = async () => {
    if (!currentCwd || !isLocalContext) {
      return;
    }

    setLoadingStatus(true);
    setError(null);
    try {
      const repoRoot = await tauriApi.getGitRepoRoot(currentCwd);
      if (!repoRoot) {
        setStatusData(null);
        setReviewDiffFile(null);
        setError('Folder aktif ini bukan repo git.');
        return;
      }

      const nextStatus = await tauriApi.getGitStatus(repoRoot);
      setStatusData(nextStatus);
      const stillExists = reviewDiffFile?.path && nextStatus.files.some((file) => file.path === reviewDiffFile.path);
      if (!stillExists) {
        setReviewDiffFile(null);
      }
    } catch (nextError) {
      setStatusData(null);
      setReviewDiffFile(null);
      setError(nextError instanceof Error ? nextError.message : 'Gagal me-refresh git status.');
    } finally {
      setLoadingStatus(false);
    }
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-[var(--color-bg-secondary)]">
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-medium text-[var(--color-text-primary)]">Code Review</h2>
            <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
              {getReviewSubtitle(statusData, currentCwd)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleRefresh()}
              disabled={!isLocalContext || loadingStatus}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
              title="Refresh Code Review"
              type="button"
            >
              {loadingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
            <button
              onClick={() => {
                setReviewDiffFile(null);
                setCodeReviewOpen(false);
              }}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
              title="Close Code Review"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
          <GitBranch className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          <span className="truncate text-[var(--color-text-primary)]">{getBranchLabel(statusData)}</span>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${getCountBadgeClass(getChangedCount(statusData))}`}>
            {formatDiffCount(getChangedCount(statusData))}
          </span>
        </div>
      </div>

      {error && !statusData ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="max-w-xs space-y-3 text-[var(--color-text-muted)]">
            <AlertCircle className="mx-auto h-8 w-8 text-[var(--color-warning)]" />
            <p className="text-sm">{error}</p>
          </div>
        </div>
      ) : statusData && statusData.files.length === 0 && !loadingStatus ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="max-w-xs space-y-3 text-[var(--color-text-muted)]">
            <FileCode2 className="mx-auto h-8 w-8" />
            <p className="text-sm">Working tree bersih. Belum ada perubahan buat direview.</p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
          <div className="shrink-0 border-b border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
            <div className="flex items-center gap-2">
              <span className="truncate">Changes</span>
              <div className="ml-auto flex items-center gap-2">
                <span className="shrink-0 font-normal text-[var(--color-success)]">{getAddedSummary(statusData)}</span>
                <span className="shrink-0 font-normal text-[var(--color-error)]">{getRemovedSummary(statusData)}</span>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {statusData?.files.map((file) => {
              const isActive = file.path === reviewDiffFile?.path;
              const { name, parent } = splitFilePath(file.path);
              return (
                <button
                  key={`${file.status}-${file.path}`}
                  onClick={() => setReviewDiffFile({ path: file.path, repoRoot: statusData.repoRoot })}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                    isActive
                      ? 'bg-[var(--color-hover)] text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
                  }`}
                  type="button"
                >
                  <FileEntryIcon name={name} isDir={false} fullPath={file.path} className="h-3.5 w-3.5" />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="truncate text-[13px] leading-4 text-[var(--color-text-primary)]">{name}</div>
                    {parent ? (
                      <div className="truncate text-[11px] leading-4 text-[var(--color-text-muted)]">{parent}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 pl-2">
                    {file.addedLines > 0 ? (
                      <span className="font-mono text-[10px] font-normal text-[var(--color-success)]">+{formatDiffCount(file.addedLines)}</span>
                    ) : null}
                    {file.removedLines > 0 ? (
                      <span className="font-mono text-[10px] font-normal text-[var(--color-error)]">-{formatDiffCount(file.removedLines)}</span>
                    ) : null}
                    <span className={`font-mono text-[11px] font-semibold uppercase ${getStatusClass(file.status)}`}>
                      {file.status === '??' ? 'U' : file.status}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
