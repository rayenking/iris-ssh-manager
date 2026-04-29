import { useState, useEffect } from 'react';
import { useSnippetStore } from '../../stores/snippetStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { tauriApi } from '../../lib/tauri';
import { SnippetForm } from './SnippetForm';
import { Plus, Search, Edit2, Trash2, Eye, EyeOff, ChevronRight, ChevronDown } from 'lucide-react';
import type { Snippet } from '../../types/snippet';

export function SnippetManager() {
  const { snippets, searchQuery, fetchSnippets, setSearchQuery, deleteSnippet } = useSnippetStore();
  const { tabs, activeTabId } = useTerminalStore();
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null | undefined>(undefined);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set());
  const isTauriRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  useEffect(() => {
    fetchSnippets().catch(console.error);
  }, [fetchSnippets]);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeTerminalTab = activeTab?.kind === 'terminal' ? activeTab : null;

  const filteredSnippets = snippets.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.command.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = Array.from(new Set(filteredSnippets.map(s => s.category || 'Uncategorized'))).sort();

  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleCommand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCommands(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleInsert = async (snippet: Snippet) => {
    if (!isTauriRuntime || !activeTerminalTab?.sessionId) return;

    let finalCommand = snippet.command;

    try {
      if (activeTerminalTab.connectionId !== 'local') {
        const connection = await tauriApi.getConnection(activeTerminalTab.connectionId);
        finalCommand = finalCommand.replace(/\{\{hostname\}\}/g, connection.hostname);
        finalCommand = finalCommand.replace(/\{\{username\}\}/g, connection.username);
        finalCommand = finalCommand.replace(/\{\{port\}\}/g, connection.port.toString());
      }

      const encoder = new TextEncoder();
      const data = encoder.encode(finalCommand);
      await tauriApi.sshWrite(activeTerminalTab.sessionId, Array.from(data));
    } catch (e) {
      console.error('Failed to insert snippet:', e);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this snippet?')) {
      await deleteSnippet(id);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--color-bg-secondary)] border-l border-[var(--color-border)]">
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
        <h2 className="text-lg font-medium text-[var(--color-text-primary)]">Snippets</h2>
        <button
          onClick={() => setEditingSnippet(null)}
          disabled={!isTauriRuntime}
          className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          title="New Snippet"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 border-b border-[var(--color-border)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Search snippets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] pl-9 pr-4 py-2 rounded border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {categories.length === 0 ? (
          <div className="text-center text-[var(--color-text-muted)] mt-10">
            <p>No snippets yet.</p>
            <p className="text-sm mt-2">Create one to save frequently-used commands.</p>
          </div>
        ) : (
          categories.map(category => {
            const isCollapsed = collapsedCategories.has(category);
            const categorySnippets = filteredSnippets.filter(s => (s.category || 'Uncategorized') === category);

            return (
              <div key={category}>
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider hover:text-[var(--color-text-secondary)] transition-colors"
                >
                  {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {category}
                  <span className="ml-auto text-[10px] font-normal normal-case tracking-normal opacity-60">
                    {categorySnippets.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="space-y-0.5 ml-1">
                    {categorySnippets.map(snippet => {
                      const isExpanded = expandedCommands.has(snippet.id);
                      const canInsert = isTauriRuntime && !!activeTerminalTab?.sessionId;

                      return (
                        <div
                          key={snippet.id}
                          className="group rounded-md hover:bg-[var(--color-bg-primary)] transition-colors"
                        >
                          <div
                            className={`flex items-center gap-2 px-2 py-1.5 ${canInsert ? 'cursor-pointer' : 'cursor-default'}`}
                            onClick={() => canInsert && handleInsert(snippet)}
                            title={canInsert ? 'Click to insert into terminal' : 'Connect to a terminal first'}
                          >
                            <span className="flex-1 text-sm text-[var(--color-text-primary)] truncate">
                              {snippet.name}
                            </span>

                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                onClick={(e) => toggleCommand(snippet.id, e)}
                                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded"
                                title={isExpanded ? 'Hide command' : 'Show command'}
                              >
                                {isExpanded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingSnippet(snippet); }}
                                disabled={!isTauriRuntime}
                                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => handleDelete(snippet.id, e)}
                                disabled={!isTauriRuntime}
                                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-bg-tertiary)] rounded"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-2 pb-2">
                              <pre className="text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] rounded px-2 py-1.5 whitespace-pre-wrap break-all border border-[var(--color-border)]">
                                {snippet.command}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {editingSnippet !== undefined && isTauriRuntime && (
        <SnippetForm
          snippet={editingSnippet}
          onClose={() => setEditingSnippet(undefined)}
        />
      )}
    </div>
  );
}
