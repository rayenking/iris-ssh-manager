import { useState, useEffect } from 'react';
import { useSnippetStore } from '../../stores/snippetStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { tauriApi } from '../../lib/tauri';
import { SnippetForm } from './SnippetForm';
import { Plus, Search, Edit2, Trash2, TerminalSquare } from 'lucide-react';
import type { Snippet } from '../../types/snippet';

export function SnippetManager() {
  const { snippets, searchQuery, fetchSnippets, setSearchQuery, deleteSnippet } = useSnippetStore();
  const { tabs, activeTabId } = useTerminalStore();
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null | undefined>(undefined);

  useEffect(() => {
    fetchSnippets().catch(console.error);
  }, [fetchSnippets]);

  const activeTab = tabs.find(t => t.id === activeTabId);

  const filteredSnippets = snippets.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.command.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = Array.from(new Set(filteredSnippets.map(s => s.category || 'Uncategorized'))).sort();

  const handleInsert = async (snippet: Snippet) => {
    if (!activeTabId || !activeTab) return;
    
    let finalCommand = snippet.command;
    
    try {
      const connection = await tauriApi.getConnection(activeTab.connectionId);
      finalCommand = finalCommand.replace(/\{\{hostname\}\}/g, connection.hostname);
      finalCommand = finalCommand.replace(/\{\{username\}\}/g, connection.username);
      finalCommand = finalCommand.replace(/\{\{port\}\}/g, connection.port.toString());
      
      const encoder = new TextEncoder();
      const data = encoder.encode(finalCommand);
      await tauriApi.sshWrite(activeTabId, Array.from(data));
    } catch (e) {
      console.error('Failed to insert snippet:', e);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this snippet?')) {
      await deleteSnippet(id);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--color-bg-secondary)] border-l border-[var(--color-border)]">
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
        <h2 className="text-lg font-medium text-[var(--color-text-primary)]">Snippets</h2>
        <button
          onClick={() => setEditingSnippet(null)}
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

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {categories.length === 0 ? (
          <div className="text-center text-[var(--color-text-muted)] mt-10">
            <p>No snippets yet.</p>
            <p className="text-sm mt-2">Create one to save frequently-used commands.</p>
          </div>
        ) : (
          categories.map(category => (
            <div key={category} className="space-y-2">
              <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                {category}
              </h3>
              <div className="space-y-2">
                {filteredSnippets.filter(s => (s.category || 'Uncategorized') === category).map(snippet => (
                  <div
                    key={snippet.id}
                    className="group bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-md p-3 hover:border-[var(--color-accent)] transition-colors cursor-pointer"
                    onClick={() => setEditingSnippet(snippet)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="font-medium text-[var(--color-text-primary)]">{snippet.name}</div>
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInsert(snippet);
                          }}
                          disabled={!activeTabId}
                          className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-tertiary)] rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Insert into active terminal"
                        >
                          <TerminalSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSnippet(snippet);
                          }}
                          className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(snippet.id, e)}
                          className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-error)] hover:bg-[var(--color-bg-tertiary)] rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 text-sm font-mono text-[var(--color-text-secondary)] truncate">
                      {snippet.command}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {editingSnippet !== undefined && (
        <SnippetForm
          snippet={editingSnippet}
          onClose={() => setEditingSnippet(undefined)}
        />
      )}
    </div>
  );
}
