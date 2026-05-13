import { X } from 'lucide-react';
import type { PointerEvent } from 'react';
import type { AppTab, TerminalTab as TerminalTabType } from '../../types/terminal';

interface Props {
  isActive: boolean;
  isDragging?: boolean;
  onClose: () => void;
  onSelect: () => void;
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  dropIndicator?: 'left' | 'right' | null;
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

export function TerminalTab({ isActive, isDragging, onClose, onPointerDown, dropIndicator, tab }: Props) {
  const statusDotClass = tab.kind === 'files' || tab.kind === 'review-diff' ? 'bg-[var(--color-accent)]' : getStatusClasses(tab.status);

  return (
    <div
      data-tab-id={tab.id}
      onPointerDown={onPointerDown}
      className={`group relative my-1 flex h-8 min-w-32 max-w-64 cursor-grab items-center rounded-full border px-3 select-none transition-colors active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      } ${
        isActive
          ? 'border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-sm'
          : 'border-transparent bg-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-hover)]'
      }`}
    >
      {dropIndicator === 'left' && <div className="absolute left-[-4px] top-1.5 bottom-1.5 w-0.5 rounded-full bg-[var(--color-accent)]" />}
      {dropIndicator === 'right' && <div className="absolute right-[-4px] top-1.5 bottom-1.5 w-0.5 rounded-full bg-[var(--color-accent)]" />}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
        {tab.kind === 'review-diff' ? (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12px] text-[var(--color-text-primary)] italic">{tab.title}</div>
            <div className="truncate text-[10px] text-[var(--color-text-muted)]">Working Tree</div>
          </div>
        ) : (
          <span className="truncate text-sm text-[var(--color-text-primary)]">{tab.title}</span>
        )}
      </div>

      <button
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className={`ml-2 rounded-full p-1 text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] ${
          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        type="button"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
