import { Plus, Code, Settings, Terminal, FolderTree, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { ConnectionList } from '../connections/ConnectionList';
import { QuickConnect } from '../connections/QuickConnect';

export function Sidebar() {
  const {
    sidebarCollapsed,
    toggleSidebar,
    explorerOpen,
    toggleExplorer,
    toggleSnippets,
    setSettingsOpen,
  } = useUiStore();
  const openLocalTab = useTerminalStore((state) => state.openLocalTab);

  const handleNewConnection = () => {
    window.dispatchEvent(new CustomEvent('open-connection-form', { detail: { connection: null } }));
  };

  return (
    <div
      className={`flex h-full flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] transition-all duration-200 ${
        sidebarCollapsed ? 'w-12' : 'w-[280px]'
      }`}
    >
      <div
        className={`shrink-0 border-b border-[var(--color-border)] ${
          sidebarCollapsed ? 'flex flex-col items-center gap-1 p-2' : 'flex items-center justify-end gap-1.5 p-3'
        }`}
      >
        <button
          onClick={toggleSidebar}
          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          type="button"
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>

        <button
          onClick={toggleExplorer}
          className={`rounded p-1.5 transition-colors ${
            explorerOpen
              ? 'bg-[var(--color-hover)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
          }`}
          title={explorerOpen ? 'Close Explorer' : 'Open Explorer'}
          type="button"
        >
          <FolderTree className="h-4 w-4" />
        </button>
      </div>

      {!sidebarCollapsed && <QuickConnect />}

      <div className="flex flex-1 flex-col overflow-hidden">
        {!sidebarCollapsed && <ConnectionList />}
      </div>

      <div className="shrink-0 flex flex-col gap-2 border-t border-[var(--color-border)] p-2">
        <div className="flex items-center justify-between">
          {!sidebarCollapsed ? (
            <button
              onClick={handleNewConnection}
              className="flex flex-1 items-center gap-2 rounded px-3 py-1.5 text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-hover)]"
            >
              <Plus className="h-4 w-4" />
              <span>New Connection</span>
            </button>
          ) : (
            <button
              onClick={handleNewConnection}
              className="flex w-full justify-center rounded p-1.5 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-hover)]"
              title="New Connection"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          {!sidebarCollapsed ? (
            <button
              onClick={openLocalTab}
              className="flex flex-1 items-center gap-2 rounded px-3 py-1.5 text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-hover)]"
            >
              <Terminal className="h-4 w-4" />
              <span>Local Terminal</span>
            </button>
          ) : (
            <button
              onClick={openLocalTab}
              className="flex w-full justify-center rounded p-1.5 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-hover)]"
              title="Local Terminal"
            >
              <Terminal className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          {!sidebarCollapsed ? (
            <button
              onClick={toggleSnippets}
              className="flex flex-1 items-center gap-2 rounded px-3 py-1.5 text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-hover)]"
            >
              <Code className="h-4 w-4" />
              <span>Snippets</span>
            </button>
          ) : (
            <div className="flex w-full flex-col items-center gap-2">
              <button
                onClick={toggleSnippets}
                className="flex w-full justify-center rounded p-1.5 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-hover)]"
                title="Snippets"
              >
                <Code className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex w-full justify-center rounded p-1.5 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-hover)]"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {!sidebarCollapsed && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-hover)]"
            type="button"
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </button>
        )}
      </div>
    </div>
  );
}
