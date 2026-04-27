import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { applyTheme } from '../../lib/themes';

export function AppearanceSettings() {
  const { theme, uiFontSize, sidebarDefaultState, setTheme, setUiFontSize, setSidebarDefaultState } = useSettingsStore();
  const [fontSize, setFontSize] = useState(uiFontSize);

  useEffect(() => {
    setFontSize(uiFontSize);
  }, [uiFontSize]);

  const handleThemeChange = (value: 'dark-minimal' | 'iris-pink') => {
    setTheme(value);
    applyTheme(value);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium text-[var(--color-text-primary)]">Theme</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Switch instantly between the two supported themes.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(['dark-minimal', 'iris-pink'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => handleThemeChange(value)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                theme === value
                  ? 'border-[var(--color-accent)] bg-[var(--color-selected)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-hover)]'
              }`}
            >
              <div className="text-sm font-medium text-[var(--color-text-primary)]">{value === 'dark-minimal' ? 'Dark Minimal' : 'Iris Pink'}</div>
              <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                {value === 'dark-minimal'
                  ? 'Muted contrast with restrained surfaces.'
                  : 'Pink-first surfaces, borders, and text treatment.'}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium text-[var(--color-text-primary)]">UI font size</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Affects general interface density.</p>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="range"
            min={12}
            max={20}
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            onPointerUp={() => setUiFontSize(fontSize)}
            onKeyUp={() => setUiFontSize(fontSize)}
            className="w-full"
          />
          <input
            type="number"
            min={12}
            max={20}
            value={fontSize}
            onChange={(event) => {
              const next = Number(event.target.value);
              setFontSize(next);
              setUiFontSize(next);
            }}
            className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-sm text-[var(--color-text-primary)]"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium text-[var(--color-text-primary)]">Sidebar default state</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Controls how the sidebar opens on launch.</p>
        </div>

        <div className="flex gap-3">
          {(['expanded', 'collapsed'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSidebarDefaultState(value)}
              className={`rounded border px-3 py-2 text-sm transition-colors ${
                sidebarDefaultState === value
                  ? 'border-[var(--color-accent)] bg-[var(--color-selected)] text-[var(--color-text-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
