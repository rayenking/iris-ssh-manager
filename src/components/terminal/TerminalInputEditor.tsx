import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, Send, CornerDownLeft } from 'lucide-react';

interface Props {
  onSubmit: (command: string) => void;
  enabled: boolean;
  onToggle: () => void;
}

export function TerminalInputEditor({ onSubmit, enabled, onToggle }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxHeight = 160;
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  useEffect(() => {
    if (enabled) {
      textareaRef.current?.focus();
    }
  }, [enabled]);

  const submit = useCallback(() => {
    const trimmed = value.trimEnd();
    if (!trimmed) return;

    onSubmit(trimmed);
    setHistory(prev => {
      const filtered = prev.filter(h => h !== trimmed);
      return [trimmed, ...filtered].slice(0, 100);
    });
    setHistoryIndex(-1);
    setValue('');
  }, [value, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }

    if (e.key === 'ArrowUp' && !e.shiftKey) {
      const ta = textareaRef.current;
      if (ta) {
        const beforeCursor = ta.value.substring(0, ta.selectionStart);
        if (!beforeCursor.includes('\n')) {
          e.preventDefault();
          const newIndex = Math.min(historyIndex + 1, history.length - 1);
          if (newIndex >= 0 && newIndex < history.length) {
            setHistoryIndex(newIndex);
            setValue(history[newIndex]);
          }
          return;
        }
      }
    }

    if (e.key === 'ArrowDown' && !e.shiftKey) {
      const ta = textareaRef.current;
      if (ta) {
        const afterCursor = ta.value.substring(ta.selectionEnd);
        if (!afterCursor.includes('\n')) {
          e.preventDefault();
          const newIndex = historyIndex - 1;
          if (newIndex < 0) {
            setHistoryIndex(-1);
            setValue('');
          } else {
            setHistoryIndex(newIndex);
            setValue(history[newIndex]);
          }
          return;
        }
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      onToggle();
    }
  }, [submit, history, historyIndex, onToggle]);

  if (!enabled) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] transition-colors w-full"
        title="Enable input editor (Shift+Enter for newlines)"
      >
        <ChevronUp className="w-3 h-3" />
        Input Editor
      </button>
    );
  }

  return (
    <div className="flex flex-col border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <div className="flex items-center justify-between px-2 py-0.5">
        <span className="text-[10px] text-[var(--color-text-muted)] select-none">
          <kbd className="px-1 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[9px]">Enter</kbd> submit
          <span className="mx-1.5">·</span>
          <kbd className="px-1 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[9px]">Shift+Enter</kbd> newline
          <span className="mx-1.5">·</span>
          <kbd className="px-1 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[9px]">↑↓</kbd> history
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          title="Close input editor"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      <div className="flex items-end gap-1 px-2 pb-1.5">
        <div className="flex-1 min-w-0 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type command..."
            rows={1}
            className="w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none font-mono leading-relaxed"
            style={{ minHeight: '32px' }}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className="flex items-center justify-center rounded bg-[var(--color-accent)] p-1.5 text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          title="Run command (Enter)"
        >
          <CornerDownLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
