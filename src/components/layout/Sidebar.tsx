import { Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { ConnectionList } from '../connections/ConnectionList';
import { QuickConnect } from '../connections/QuickConnect';

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const { searchQuery, setSearchQuery } = useConnectionStore();

  const handleNewConnection = () => {
    window.dispatchEvent(new CustomEvent('open-connection-form', { detail: { connection: null } }));
  };

  return (
    <div 
      className={`flex flex-col h-full bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] transition-all duration-200 ${
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

      <div className="p-2 border-t border-[var(--color-border)] flex items-center justify-between shrink-0">
        {!sidebarCollapsed ? (
          <>
            <button 
              onClick={handleNewConnection}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Connection</span>
            </button>
            <button 
              onClick={toggleSidebar}
              className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-2 w-full items-center">
            <button 
              onClick={handleNewConnection}
              className="p-1.5 text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button 
              onClick={toggleSidebar}
              className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
