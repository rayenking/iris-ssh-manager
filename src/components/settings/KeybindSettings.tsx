import { useMemo, useState, type KeyboardEvent } from 'react';
import { getRegisteredActions } from '../../lib/keybindings';
import { useSettingsStore } from '../../stores/settingsStore';

export function KeybindSettings() {
  const { keybindings, updateKeybinding, resetKeybinding, resetKeybindingsToDefaults } = useSettingsStore();
  const actions = useMemo(() => getRegisteredActions(), []);
  const [editingAction, setEditingAction] = useState<string | null>(null);

  const captureCombo = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!editingAction) {
      return;
    }

    event.preventDefault();

    const parts: string[] = [];
    if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
    if (event.shiftKey) parts.push('Shift');
    if (event.altKey) parts.push('Alt');
    parts.push(event.key.length === 1 ? event.key.toLowerCase() : event.key);

    updateKeybinding(editingAction, parts.join('+'));
    setEditingAction(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-medium text-[var(--color-text-primary)]">Keybindings</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Edit one shortcut at a time or restore the defaults.</p>
        </div>

        <button
          type="button"
          onClick={resetKeybindingsToDefaults}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
        >
          Reset to Defaults
        </button>
      </div>

      <div className="space-y-2">
        {actions.map((action) => (
          <div
            key={action}
            className="flex items-center justify-between gap-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3"
          >
            <div>
              <div className="text-sm font-medium text-[var(--color-text-primary)]">{action}</div>
              <div className="text-xs text-[var(--color-text-muted)]">Current combo</div>
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)]">
                {keybindings[action] || 'Unassigned'}
              </div>
              <button
                type="button"
                onClick={() => setEditingAction(action)}
                className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
              >
                {editingAction === action ? 'Press keys…' : 'Edit'}
              </button>
              <button
                type="button"
                onClick={() => resetKeybinding(action)}
                className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
              >
                Reset
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingAction && (
        <input
          autoFocus
          onKeyDown={captureCombo}
          className="sr-only"
          aria-label="Capture keybinding"
        />
      )}
    </div>
  );
}
