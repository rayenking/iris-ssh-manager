import { Copy, ClipboardPaste } from 'lucide-react';

interface Props {
  x: number;
  y: number;
  hasSelection: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onClose: () => void;
}

export function TerminalContextMenu({ x, y, hasSelection, onCopy, onPaste, onClose }: Props) {
  const handleCopy = () => {
    onCopy();
    onClose();
  };

  const handlePaste = () => {
    onPaste();
    onClose();
  };

  return (
    <div
      className="fixed z-50 min-w-[160px] rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        onClick={handleCopy}
        disabled={!hasSelection}
        className="flex w-full items-center gap-3 px-3 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent transition-colors"
      >
        <Copy className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">Copy</span>
        <span className="text-xs text-[var(--color-text-muted)]">Ctrl+Shift+C</span>
      </button>
      <button
        type="button"
        onClick={handlePaste}
        className="flex w-full items-center gap-3 px-3 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-colors"
      >
        <ClipboardPaste className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">Paste</span>
        <span className="text-xs text-[var(--color-text-muted)]">Ctrl+Shift+V</span>
      </button>
    </div>
  );
}
