import { useEffect, useMemo, useState } from 'react';
import { AppearanceSettings } from './AppearanceSettings';
import { ConnectionsSettings } from './ConnectionsSettings';
import { TerminalSettings } from './TerminalSettings';
import { KeybindSettings } from './KeybindSettings';
import { useUiStore } from '../../stores/uiStore';

type SettingsTab = 'appearance' | 'terminal' | 'connections' | 'keybindings';

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'connections', label: 'Connections' },
  { id: 'keybindings', label: 'Keybindings' },
];

export function SettingsPage() {
  const { setSettingsOpen } = useUiStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [setSettingsOpen]);

  const content = useMemo(() => {
    if (activeTab === 'appearance') {
      return <AppearanceSettings />;
    }

    if (activeTab === 'terminal') {
      return <TerminalSettings />;
    }

    if (activeTab === 'keybindings') {
      return <KeybindSettings />;
    }

    if (activeTab === 'connections') {
      return <ConnectionsSettings />;
    }

    return (
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-sm text-[var(--color-text-muted)]">
        Connection settings stay tied to the existing connection editor for now.
      </div>
    );
  }, [activeTab]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[min(90vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-4">
          <div>
            <h2 className="text-lg font-medium text-[var(--color-text-primary)]">Settings</h2>
            <p className="text-sm text-[var(--color-text-muted)]">Appearance, terminal, connections, and keybindings.</p>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
            type="button"
          >
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 md:w-56 md:border-b-0 md:border-r">
            <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded px-3 py-2 text-left text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[var(--color-selected)] text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
