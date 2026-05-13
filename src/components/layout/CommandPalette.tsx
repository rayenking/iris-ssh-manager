import { useState, useEffect, useRef } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSnippetStore } from '../../stores/snippetStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { tauriApi } from '../../lib/tauri';
import { Search, Terminal, Code, Zap, Settings, RefreshCw, SunMoon } from 'lucide-react';

interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  type: 'connection' | 'snippet' | 'action';
  icon: React.ReactNode;
  onSelect: () => void;
}

export function CommandPalette() {
  const { commandPaletteOpen, toggleCommandPalette, currentTheme, setImportDialogOpen, setSettingsOpen } = useUiStore();
  const setTheme = useSettingsStore((state) => state.setTheme);
  const { connections } = useConnectionStore();
  const { snippets } = useSnippetStore();
  const { openTab, activeTabId, tabs } = useTerminalStore();
  
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeTerminalTab = activeTab?.kind === 'terminal' ? activeTab : null;

  // Focus input when opened
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  // Handle escape globally is already somewhat handled if we bind here
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && commandPaletteOpen) {
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, toggleCommandPalette]);

  if (!commandPaletteOpen) return null;

  const insertSnippet = async (command: string) => {
    if (!activeTerminalTab?.sessionId) return;
    try {
      const connection = await tauriApi.getConnection(activeTerminalTab.connectionId);
      let finalCommand = command.replace(/\{\{hostname\}\}/g, connection.hostname);
      finalCommand = finalCommand.replace(/\{\{username\}\}/g, connection.username);
      finalCommand = finalCommand.replace(/\{\{port\}\}/g, connection.port.toString());
      
      const encoder = new TextEncoder();
      const data = encoder.encode(finalCommand);
      await tauriApi.sshWrite(activeTerminalTab.sessionId, Array.from(data));
    } catch (e) {
      console.error('Failed to insert snippet:', e);
    }
  };

  const allItems: PaletteItem[] = [
    // Actions
    {
      id: 'action-new-conn',
      title: 'New Connection',
      type: 'action',
      icon: <Terminal className="w-4 h-4" />,
      onSelect: () => {
        window.dispatchEvent(new CustomEvent('open-connection-form'));
      }
    },
    {
      id: 'action-import-config',
      title: 'Import SSH Config',
      type: 'action',
      icon: <RefreshCw className="w-4 h-4" />,
      onSelect: () => {
        setImportDialogOpen(true);
      }
    },
    {
      id: 'action-local-terminal',
      title: 'Terminal',
      type: 'action',
      icon: <Terminal className="w-4 h-4" />,
      onSelect: () => {
        useTerminalStore.getState().openLocalTab();
      }
    },
    {
      id: 'action-settings',
      title: 'Settings',
      type: 'action',
      icon: <Settings className="w-4 h-4" />,
      onSelect: () => {
        setSettingsOpen(true);
        if (commandPaletteOpen) {
          toggleCommandPalette();
        }
      }
    },
    {
      id: 'action-theme',
      title: 'Toggle Theme',
      type: 'action',
      icon: <SunMoon className="w-4 h-4" />,
      onSelect: () => {
        setTheme(currentTheme === 'dark-minimal' ? 'iris-pink' : 'dark-minimal');
      }
    },
    
    // Connections
    ...connections.map(c => ({
      id: `conn-${c.id}`,
      title: c.name,
      subtitle: `${c.username}@${c.hostname}:${c.port}`,
      type: 'connection' as const,
      icon: <Terminal className="w-4 h-4" />,
      onSelect: () => openTab(c.id, c.name),
    })),

    // Snippets
    ...snippets.map(s => ({
      id: `snip-${s.id}`,
      title: s.name,
      subtitle: s.command,
      type: 'snippet' as const,
      icon: <Code className="w-4 h-4" />,
      onSelect: () => {
        if (activeTerminalTab?.sessionId) {
          insertSnippet(s.command);
        } else {
          // Can't insert if no terminal active
          console.warn('No active terminal to insert snippet');
        }
      }
    }))
  ];

  const q = query.toLowerCase();
  
  const filteredActions = allItems.filter(i => i.type === 'action' && (i.title.toLowerCase().includes(q) || i.subtitle?.toLowerCase().includes(q))).slice(0, 10);
  const filteredConnections = allItems.filter(i => i.type === 'connection' && (i.title.toLowerCase().includes(q) || i.subtitle?.toLowerCase().includes(q))).slice(0, 10);
  const filteredSnippets = allItems.filter(i => i.type === 'snippet' && (i.title.toLowerCase().includes(q) || i.subtitle?.toLowerCase().includes(q))).slice(0, 10);

  const displayedItems = [...filteredActions, ...filteredConnections, ...filteredSnippets];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(displayedItems.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + displayedItems.length) % Math.max(displayedItems.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = displayedItems[selectedIndex];
      if (item) {
        item.onSelect();
        toggleCommandPalette();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh]">
      <div 
        className="w-full max-w-2xl bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-[var(--color-border)]">
          <Search className="w-5 h-5 text-[var(--color-text-muted)] mr-3" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none"
            placeholder="Search connections, snippets, and commands..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center space-x-1 text-xs text-[var(--color-text-muted)] font-mono">
            <span className="px-1.5 py-0.5 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded">↑↓</span>
            <span>to navigate</span>
            <span className="px-1.5 py-0.5 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded ml-2">↵</span>
            <span>to select</span>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {displayedItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--color-text-muted)]">
              No results found for "{query}"
            </div>
          ) : (
            <div className="py-2">
              {filteredActions.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-1 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Actions
                  </div>
                  {filteredActions.map((item, idx) => {
                    const globalIdx = idx;
                    return (
                      <PaletteRow 
                        key={item.id} 
                        item={item} 
                        selected={globalIdx === selectedIndex} 
                        onClick={() => {
                          item.onSelect();
                          toggleCommandPalette();
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {filteredConnections.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-1 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Connections
                  </div>
                  {filteredConnections.map((item, idx) => {
                    const globalIdx = filteredActions.length + idx;
                    return (
                      <PaletteRow 
                        key={item.id} 
                        item={item} 
                        selected={globalIdx === selectedIndex} 
                        onClick={() => {
                          item.onSelect();
                          toggleCommandPalette();
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {filteredSnippets.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-1 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Snippets
                  </div>
                  {filteredSnippets.map((item, idx) => {
                    const globalIdx = filteredActions.length + filteredConnections.length + idx;
                    return (
                      <PaletteRow 
                        key={item.id} 
                        item={item} 
                        selected={globalIdx === selectedIndex} 
                        onClick={() => {
                          item.onSelect();
                          toggleCommandPalette();
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="absolute inset-0 z-[-1]" onClick={toggleCommandPalette} />
    </div>
  );
}

function PaletteRow({ item, selected, onClick }: { item: PaletteItem; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center px-4 py-2 cursor-pointer ${
        selected 
          ? 'bg-[var(--color-accent)] text-white' 
          : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]'
      }`}
    >
      <div className={`mr-3 ${selected ? 'text-white' : 'text-[var(--color-text-muted)]'}`}>
        {item.icon}
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className="text-sm font-medium truncate">{item.title}</span>
        {item.subtitle && (
          <span className={`text-xs truncate ${selected ? 'text-white/80' : 'text-[var(--color-text-secondary)]'}`}>
            {item.subtitle}
          </span>
        )}
      </div>
      {item.type === 'snippet' && (
        <div className="ml-auto flex items-center">
          <Zap className={`w-3 h-3 ${selected ? 'text-white/80' : 'text-[var(--color-accent)]'}`} />
        </div>
      )}
    </div>
  );
}
