import { Moon, Sun, Activity, RefreshCw, Check, AlertCircle, ChevronRight } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useSplitStore } from '../../stores/splitStore';
import type { AppTab, TerminalTab, LocalTerminalTab } from '../../types/terminal';
import { useUpdateChecker } from './UpdateNotification';
import { tauriApi } from '../../lib/tauri';

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

type TerminalContextTab = TerminalTab | LocalTerminalTab;

type StatusBarState = {
  kind: 'none' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'missing-context';
  path: string;
  title: string;
};

type BreadcrumbPart = {
  key: string;
  label: string;
  fullPath: string;
  current?: boolean;
};

function isTerminalContextTab(tab: AppTab | null | undefined): tab is TerminalContextTab {
  return tab?.kind === 'terminal' || tab?.kind === 'local-terminal';
}

function normalizePath(path: string) {
  return path.trim();
}

function buildBreadcrumbs(path: string): BreadcrumbPart[] {
  const normalized = normalizePath(path);
  if (!normalized || normalized === '.') {
    return [];
  }

  const windowsMatch = normalized.match(/^([A-Za-z]:)([\\/].*)?$/);
  if (windowsMatch) {
    const drive = windowsMatch[1];
    const rest = (windowsMatch[2] ?? '').replace(/\\/g, '/');
    const segments = rest.split('/').filter(Boolean);
    const crumbs: BreadcrumbPart[] = [{ key: drive, label: drive, fullPath: `${drive}/` }];
    let currentPath = `${drive}/`;

    for (const segment of segments) {
      currentPath = `${currentPath}${segment}/`;
      crumbs.push({
        key: `${currentPath}-${segment}`,
        label: segment,
        fullPath: currentPath,
      });
    }

    if (crumbs.length > 0) {
      crumbs[crumbs.length - 1].current = true;
    }

    return crumbs;
  }

  if (normalized === '/') {
    return [{ key: '/', label: '/', fullPath: '/', current: true }];
  }

  const absolute = normalized.startsWith('/');
  const segments = normalized.split('/').filter(Boolean);
  const crumbs: BreadcrumbPart[] = [];
  let currentPath = absolute ? '/' : '';

  if (absolute) {
    crumbs.push({ key: '/', label: '/', fullPath: '/' });
  }

  for (const segment of segments) {
    currentPath = absolute ? `${currentPath}${segment}/` : currentPath ? `${currentPath}/${segment}` : segment;
    crumbs.push({
      key: `${currentPath}-${segment}`,
      label: segment,
      fullPath: currentPath,
    });
  }

  if (crumbs.length > 0) {
    crumbs[crumbs.length - 1].current = true;
  }

  return crumbs;
}

function collapseBreadcrumbs(parts: BreadcrumbPart[]) {
  if (parts.length <= 4) {
    return parts;
  }

  const first = parts[0];
  const tail = parts.slice(-3);
  return [first, { key: 'ellipsis', label: '…', fullPath: parts[parts.length - 1].fullPath }, ...tail];
}

function resolveStatusBarState(
  activeTab: AppTab | null,
  tabs: AppTab[],
  focusedPaneIdByTabId: Record<string, string | null>,
  paneRuntimeById: Record<string, { cwd?: string; status?: string }>,
): StatusBarState {
  if (!activeTab) {
    return {
      kind: 'none',
      path: '',
      title: 'No active tab',
    };
  }

  let contextTab: TerminalContextTab | null = null;
  if (activeTab.kind === 'files') {
    contextTab = tabs.find((tab): tab is TerminalContextTab => isTerminalContextTab(tab) && tab.id === activeTab.terminalTabId) ?? null;
  } else if (isTerminalContextTab(activeTab)) {
    contextTab = activeTab;
  }

  if (!contextTab) {
    return {
      kind: 'missing-context',
      path: '',
      title: 'Terminal context unavailable',
    };
  }

  const focusedPaneId = focusedPaneIdByTabId[contextTab.id] ?? contextTab.id;
  const runtime = paneRuntimeById[focusedPaneId] ?? null;
  const path = runtime?.cwd ?? '';
  const status = runtime?.status ?? contextTab.status;

  if (status === 'error') {
    return {
      kind: 'error',
      path,
      title: 'Connection error',
    };
  }

  if (status === 'disconnected') {
    return {
      kind: 'disconnected',
      path,
      title: 'Disconnected',
    };
  }

  if (status === 'connecting') {
    return {
      kind: 'connecting',
      path,
      title: 'Connecting…',
    };
  }

  if (!path || path === '.') {
    return {
      kind: 'connected',
      path: '',
      title: 'Waiting for path…',
    };
  }

  return {
    kind: 'connected',
    path,
    title: path,
  };
}

function getStatusColor(kind: StatusBarState['kind']) {
  if (kind === 'error' || kind === 'missing-context') return 'text-[var(--color-error)]';
  if (kind === 'disconnected') return 'text-[var(--color-text-muted)]';
  return 'text-[var(--color-success)]';
}

export function StatusBar() {
  const currentTheme = useUiStore((state) => state.currentTheme);
  const setTheme = useUiStore((state) => state.setTheme);
  const updateTheme = useSettingsStore((state) => state.setTheme);
  const activeTabId = useTerminalStore((state) => state.activeTabId);
  const tabs = useTerminalStore((state) => state.tabs);
  const focusedPaneIdByTabId = useSplitStore((state) => state.focusedPaneIdByTabId);
  const paneRuntimeById = useSplitStore((state) => state.paneRuntimeById);
  const { currentVersion, manualCheck, checking, result } = useUpdateChecker();

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const statusState = resolveStatusBarState(activeTab, tabs, focusedPaneIdByTabId, paneRuntimeById);
  const breadcrumbs = collapseBreadcrumbs(buildBreadcrumbs(statusState.path));

  let contextTab: TerminalContextTab | null = null;
  if (activeTab?.kind === 'files') {
    contextTab = tabs.find((tab): tab is TerminalContextTab => isTerminalContextTab(tab) && tab.id === activeTab.terminalTabId) ?? null;
  } else if (isTerminalContextTab(activeTab)) {
    contextTab = activeTab;
  }

  const focusedPaneId = contextTab ? (focusedPaneIdByTabId[contextTab.id] ?? contextTab.id) : null;
  const activePaneRuntime = focusedPaneId ? (paneRuntimeById[focusedPaneId] ?? null) : null;
  const canNavigateBreadcrumb = Boolean(
    contextTab &&
    focusedPaneId &&
    activePaneRuntime?.sessionId &&
    activePaneRuntime?.status === 'connected',
  );

  const handleNavigateToPath = async (targetPath: string) => {
    if (!contextTab || !focusedPaneId || !activePaneRuntime?.sessionId || activePaneRuntime.status !== 'connected') {
      return;
    }

    const command = `cd ${shellEscape(targetPath)}\n`;
    const data = Array.from(new TextEncoder().encode(command));
    const splitStore = useSplitStore.getState();

    if (contextTab.kind === 'local-terminal') {
      await tauriApi.localShellWrite(activePaneRuntime.sessionId, data);
      splitStore.setPaneCwd(focusedPaneId, targetPath);

      const pollCwd = (delay: number) => {
        window.setTimeout(() => {
          const runtime = useSplitStore.getState().paneRuntimeById[focusedPaneId];
          if (!runtime?.sessionId) {
            return;
          }

          void tauriApi.localShellCwd(runtime.sessionId).then((cwd) => {
            if (cwd) {
              useSplitStore.getState().setPaneCwd(focusedPaneId, cwd);
            }
          }).catch(() => {});
        }, delay);
      };

      pollCwd(100);
      pollCwd(350);
      return;
    }

    await tauriApi.sshWrite(activePaneRuntime.sessionId, data);
    splitStore.setPaneCwd(focusedPaneId, targetPath);
  };

  const toggleTheme = () => {
    const newTheme = currentTheme === 'dark-minimal' ? 'iris-pink' : 'dark-minimal';
    setTheme(newTheme);
    updateTheme(newTheme);
  };

  return (
    <div className="h-7 shrink-0 select-none border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 text-xs text-[var(--color-text-muted)]">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-2 hover:text-[var(--color-text-primary)]" title={statusState.title}>
            <Activity className={`h-3.5 w-3.5 shrink-0 ${getStatusColor(statusState.kind)}`} />
            {statusState.kind === 'connected' && breadcrumbs.length > 0 ? (
              <div className="flex min-w-0 items-center gap-1 overflow-hidden" title={statusState.path}>
                {breadcrumbs.map((crumb, index) => (
                  <div key={crumb.key} className="flex min-w-0 items-center gap-1">
                    {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]" />}
                    <button
                      type="button"
                      onClick={() => { void handleNavigateToPath(crumb.fullPath); }}
                      disabled={!canNavigateBreadcrumb}
                      className={`max-w-[10rem] truncate rounded-md px-1.5 py-0.5 text-left transition-colors ${crumb.current ? 'bg-[var(--color-hover)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'} ${canNavigateBreadcrumb ? 'hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]' : 'cursor-default opacity-60'}`}
                      title={crumb.fullPath}
                    >
                      {crumb.label}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <span className="truncate">{statusState.title}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span>IrisX{currentVersion ? ` v${currentVersion}` : ''}</span>
            <button
              onClick={manualCheck}
              disabled={checking}
              className="rounded p-0.5 hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
              title={checking ? 'Checking...' : result === 'up-to-date' ? 'Up to date!' : 'Check for updates'}
            >
              {result === 'up-to-date' ? (
                <Check className="h-3 w-3 text-[var(--color-success)]" />
              ) : result === 'error' ? (
                <AlertCircle className="h-3 w-3 text-[var(--color-error)]" />
              ) : (
                <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
              )}
            </button>
          </div>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 hover:text-[var(--color-text-primary)]"
            title={`Switch to ${currentTheme === 'dark-minimal' ? 'Iris Pink' : 'Dark Minimal'} theme`}
          >
            {currentTheme === 'dark-minimal' ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
