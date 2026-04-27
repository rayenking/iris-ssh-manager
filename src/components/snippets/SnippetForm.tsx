import { useState, useEffect } from 'react';
import { useSnippetStore } from '../../stores/snippetStore';
import type { Snippet } from '../../types/snippet';

interface SnippetFormProps {
  snippet: Snippet | null;
  onClose: () => void;
}

export function SnippetForm({ snippet, onClose }: SnippetFormProps) {
  const { createSnippet, updateSnippet, snippets } = useSnippetStore();
  
  const [name, setName] = useState(snippet?.name || '');
  const [command, setCommand] = useState(snippet?.command || '');
  const [category, setCategory] = useState(snippet?.category || '');
  const [variables, setVariables] = useState(snippet?.variables || '');
  const [error, setError] = useState('');

  const allCategories = Array.from(new Set(snippets.map(s => s.category).filter(Boolean))) as string[];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!command.trim()) {
      setError('Command is required');
      return;
    }

    try {
      const data = {
        name: name.trim(),
        command: command.trim(),
        category: category.trim() || null,
        variables: variables.trim() || null,
      };

      if (snippet) {
        await updateSnippet(snippet.id, data);
      } else {
        await createSnippet(data);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save snippet');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex justify-between items-center">
          <h2 className="text-xl font-medium text-[var(--color-text-primary)]">
            {snippet ? 'Edit Snippet' : 'New Snippet'}
          </h2>
          <button 
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 text-[var(--color-error)] rounded text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                placeholder="Update apt packages"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="category-suggestions"
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                placeholder="System, Docker, Git..."
              />
              <datalist id="category-suggestions">
                {allCategories.map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Command *
              </label>
              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                rows={5}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] font-mono text-sm focus:outline-none focus:border-[var(--color-accent)]"
                placeholder="sudo apt update && sudo apt upgrade -y"
              />
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Use {'{{variable_name}}'} for dynamic values. e.g. {'{{hostname}}'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Variables (comma-separated)
              </label>
              <input
                type="text"
                value={variables}
                onChange={(e) => setVariables(e.target.value)}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                placeholder="hostname, username, custom_var"
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-[var(--color-accent)] text-white rounded hover:bg-[var(--color-accent)]/90 transition-colors"
            >
              Save Snippet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
