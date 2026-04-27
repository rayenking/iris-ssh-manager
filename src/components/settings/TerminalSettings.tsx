import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

const fontOptions = ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'];
const cursorOptions = ['block', 'underline', 'bar'] as const;
const bellOptions = ['none', 'visual', 'audio'] as const;

export function TerminalSettings() {
  const {
    terminalFont,
    terminalFontSize,
    cursorStyle,
    cursorBlink,
    scrollbackBuffer,
    bell,
    saveTerminalSettings,
  } = useSettingsStore();

  const [draft, setDraft] = useState({
    terminalFont,
    terminalFontSize,
    cursorStyle,
    cursorBlink,
    scrollbackBuffer,
    bell,
  });

  useEffect(() => {
    setDraft({ terminalFont, terminalFontSize, cursorStyle, cursorBlink, scrollbackBuffer, bell });
  }, [bell, cursorBlink, cursorStyle, scrollbackBuffer, terminalFont, terminalFontSize]);

  const commit = (next: Partial<typeof draft>) => {
    const merged = { ...draft, ...next };
    setDraft(merged);
    saveTerminalSettings(merged);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium text-[var(--color-text-primary)]">Font family</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Used for active terminal sessions and new tabs.</p>
        </div>

        <select
          value={draft.terminalFont}
          onChange={(event) => commit({ terminalFont: event.target.value })}
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
        >
          {fontOptions.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium text-[var(--color-text-primary)]">Font size</h3>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={10}
            max={24}
            value={draft.terminalFontSize}
            onChange={(event) => commit({ terminalFontSize: Number(event.target.value) })}
            className="w-full"
          />
          <input
            type="number"
            min={10}
            max={24}
            value={draft.terminalFontSize}
            onChange={(event) => commit({ terminalFontSize: Number(event.target.value) })}
            className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-sm text-[var(--color-text-primary)]"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium text-[var(--color-text-primary)]">Cursor</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          {cursorOptions.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => commit({ cursorStyle: value })}
              className={`rounded border px-3 py-2 text-sm transition-colors ${
                draft.cursorStyle === value
                  ? 'border-[var(--color-accent)] bg-[var(--color-selected)] text-[var(--color-text-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            onClick={() => commit({ cursorBlink: !draft.cursorBlink })}
            className={`rounded border px-3 py-2 text-sm transition-colors ${
              draft.cursorBlink
                ? 'border-[var(--color-accent)] bg-[var(--color-selected)] text-[var(--color-text-primary)]'
                : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Cursor blink {draft.cursorBlink ? 'on' : 'off'}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium text-[var(--color-text-primary)]">Scrollback buffer</h3>
        </div>
        <input
          type="number"
          min={1000}
          max={100000}
          step={1000}
          value={draft.scrollbackBuffer}
          onChange={(event) => commit({ scrollbackBuffer: Number(event.target.value) })}
          className="w-48 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
        />
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium text-[var(--color-text-primary)]">Bell</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          {bellOptions.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => commit({ bell: value })}
              className={`rounded border px-3 py-2 text-sm transition-colors ${
                draft.bell === value
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
