import { Search, Plus, ChevronLeft, ChevronRight, Code, Settings, Terminal } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { ConnectionList } from '../connections/ConnectionList';
import { QuickConnect } from '../connections/QuickConnect';

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, toggleSnippets, setSettingsOpen } = useUiStore();
  const { searchQuery, setSearchQuery } = useConnectionStore();
  const openLocalTab = useTerminalStore((state) => state.openLocalTab);

  const handleNewConnection = () => {
    window.dispatchEvent(new CustomEvent('open-connection-form', { detail: { connection: null } }));
  };

  return (
    <div className="relative flex h-full">
    <div 
      className={`flex flex-col h-full bg-[var(--color-bg-secondary)] transition-all duration-200 ${
        sidebarCollapsed ? 'w-12' : 'w-[280px]'
      }`}
    >
      <div className="p-3 border-b border-[var(--color-border)] flex items-center shrink-0">
        {!sidebarCollapsed ? (
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] text-sm rounded pl-8 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] placeholder-[var(--color-text-muted)]"
            />
          </div>
        ) : (
          <div className="flex-1 flex justify-center">
            <Search className="w-5 h-5 text-[var(--color-text-muted)]" />
          </div>
        )}
      </div>

      {!sidebarCollapsed && <QuickConnect />}

      <div className="flex-1 overflow-hidden flex flex-col">
        {!sidebarCollapsed && <ConnectionList />}
      </div>

      <div className="p-2 border-t border-[var(--color-border)] flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          {!sidebarCollapsed ? (
            <>
              <button 
                onClick={handleNewConnection}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors flex-1"
              >
                <Plus className="w-4 h-4" />
                <span>New Connection</span>
              </button>
            </>
          ) : (
            <button 
              onClick={handleNewConnection}
              className="p-1.5 text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors w-full flex justify-center"
              title="New Connection"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          {!sidebarCollapsed ? (
            <button 
              onClick={openLocalTab}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors flex-1"
            >
              <Terminal className="w-4 h-4" />
              <span>Local Terminal</span>
            </button>
          ) : (
            <button 
              onClick={openLocalTab}
              className="p-1.5 text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors w-full flex justify-center"
              title="Local Terminal"
            >
              <Terminal className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          {!sidebarCollapsed ? (
              <button 
                onClick={toggleSnippets}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors flex-1"
              >
                <Code className="w-4 h-4" />
                <span>Snippets</span>
              </button>
          ) : (
            <div className="flex flex-col gap-2 w-full items-center">
              <button 
                onClick={toggleSnippets}
                className="p-1.5 text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors w-full flex justify-center"
                title="Snippets"
              >
                <Code className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setSettingsOpen(true)}
                className="p-1.5 text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors w-full flex justify-center"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {!sidebarCollapsed && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors w-full"
            type="button"
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
        )}
      </div>
    </div>
    <button
      onClick={toggleSidebar}
      className="w-3 h-full flex items-center justify-center border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-hover)] transition-colors group cursor-col-resize shrink-0"
      title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
    >
      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-text-muted)]">
        {sidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </div>
    </button>
    </div>
  );
}
