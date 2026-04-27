import { FolderOpen, Plus } from 'lucide-react';
import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalTab } from '../terminal/TerminalTab';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, openFileBrowserTab } = useTerminalStore();
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  const handleOpenFiles = () => {
    if (!activeTab || activeTab.kind !== 'terminal' || !activeTab.sessionId) {
      return;
    }

    openFileBrowserTab(activeTab.id, activeTab.connectionId, activeTab.title);
  };

  return (
    <div className="flex items-center h-10 bg-[var(--color-bg-primary)] border-b border-[var(--color-border)] overflow-x-auto shrink-0">
      <div className="flex flex-1 items-center h-full">
        {tabs.map((tab) => (
          <TerminalTab
            key={tab.id}
            tab={tab}
            isActive={activeTabId === tab.id}
            onSelect={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
          />
        ))}
      </div>

      <button
        className="h-full px-3 flex items-center gap-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors border-l border-[var(--color-border)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!activeTab || activeTab.kind !== 'terminal' || !activeTab.sessionId}
        onClick={handleOpenFiles}
        title="Open SFTP file browser"
        type="button"
      >
        <FolderOpen className="w-4 h-4" />
      </button>

      <button 
        className="h-full px-3 flex items-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors border-l border-[var(--color-border)]"
        type="button"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
