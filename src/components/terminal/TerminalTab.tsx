import { X } from 'lucide-react';
import type { AppTab, TerminalTab as TerminalTabType } from '../../types/terminal';

interface Props {
  isActive: boolean;
  onClose: () => void;
  onSelect: () => void;
  tab: AppTab;
}

function getStatusClasses(status: TerminalTabType['status']) {
  if (status === 'connected') {
    return 'bg-[var(--color-success)]';
  }

  if (status === 'connecting') {
    return 'bg-[var(--color-warning)] animate-pulse';
  }

  if (status === 'error') {
    return 'bg-[var(--color-error)]';
  }

  return 'bg-[var(--color-text-muted)]';
}

export function TerminalTab({ isActive, onClose, onSelect, tab }: Props) {
  const statusDotClass = tab.kind === 'terminal' ? getStatusClasses(tab.status) : 'bg-[var(--color-accent)]';

  return (
    <div
      onClick={onSelect}
      className={`group flex items-center h-full min-w-32 max-w-64 px-3 border-r border-[var(--color-border)] cursor-pointer select-none transition-colors ${
        isActive
          ? 'bg-[var(--color-bg-secondary)] border-t-2 border-t-[var(--color-accent)]'
          : 'bg-[var(--color-bg-primary)] hover:bg-[var(--color-hover)] border-t-2 border-t-transparent'
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`w-2 h-2 rounded-full ${statusDotClass}`} />
        <span className="text-sm truncate text-[var(--color-text-primary)]">{tab.title}</span>
      </div>

      <button
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="ml-2 p-1 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
