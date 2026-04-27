import { X, Plus } from 'lucide-react';
import { useTerminalStore } from '../../stores/terminalStore';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTerminalStore();

  return (
    <div className="flex items-center h-10 bg-[var(--color-bg-primary)] border-b border-[var(--color-border)] overflow-x-auto shrink-0">
      <div className="flex flex-1 items-center h-full">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group flex items-center h-full min-w-32 max-w-64 px-3 border-r border-[var(--color-border)] cursor-pointer select-none transition-colors ${
              activeTabId === tab.id 
                ? 'bg-[var(--color-bg-secondary)] border-t-2 border-t-[var(--color-accent)]' 
                : 'bg-[var(--color-bg-primary)] hover:bg-[var(--color-hover)] border-t-2 border-t-transparent'
            }`}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className={`w-2 h-2 rounded-full ${
                tab.status === 'connected' ? 'bg-[var(--color-success)]' :
                tab.status === 'connecting' ? 'bg-[var(--color-warning)] animate-pulse' :
                tab.status === 'error' ? 'bg-[var(--color-error)]' :
                'bg-[var(--color-text-muted)]'
              }`} />
              <span className="text-sm truncate text-[var(--color-text-primary)]">
                {tab.title}
              </span>
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-2 p-1 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      
      <button 
        className="h-full px-3 flex items-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors border-l border-[var(--color-border)]"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
