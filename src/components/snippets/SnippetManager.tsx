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
  const activeTerminalTab = (activeTab?.kind === 'terminal' || activeTab?.kind === 'local-terminal') ? activeTab : null;

  const activeConnectionId = activeTerminalTab?.connectionId ?? null;

  const scopedSnippets = snippets.filter(s => {
    if (!s.scope || s.scope === 'global') return true;
    if (s.scope === 'connections' && s.connectionIds && activeConnectionId) {
      try {
        const ids: string[] = JSON.parse(s.connectionIds);
        return ids.includes(activeConnectionId);
      } catch { return false; }
    }
    return !activeConnectionId;
  });

  const filteredSnippets = scopedSnippets.filter(s =>
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
      if (activeTerminalTab.connectionId === 'local') {
        await tauriApi.localShellWrite(activeTerminalTab.sessionId, Array.from(data));
      } else {
        await tauriApi.sshWrite(activeTerminalTab.sessionId, Array.from(data));
      }
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
    <div className="flex h-full w-full flex-col bg-[var(--color-bg-secondary)]">
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-[var(--color-text-primary)]">Snippets</h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Reusable terminal commands with scoped visibility.</p>
          </div>
          <button
            onClick={() => setEditingSnippet(null)}
            disabled={!isTauriRuntime}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
            title="New Snippet"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Search snippets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-2.5 pl-10 pr-4 text-sm text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
          />
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-3">
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
                          className="group rounded-[var(--radius-md)] border border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-bg-primary)] transition-colors"
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
