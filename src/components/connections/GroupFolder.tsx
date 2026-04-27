import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import type { ConnectionGroup } from '../../types/connection';

interface Props {
  group: ConnectionGroup;
  count: number;
  children: React.ReactNode;
}

export function GroupFolder({ group, count, children }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-1">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center px-2 py-1.5 mx-2 cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors"
      >
        {isOpen ? <ChevronDown className="w-4 h-4 mr-1 shrink-0" /> : <ChevronRight className="w-4 h-4 mr-1 shrink-0" />}
        <Folder className="w-4 h-4 mr-2 shrink-0" style={{ color: group.color || 'inherit' }} />
        <span className="text-sm font-medium flex-1 truncate">{group.name}</span>
        <span className="text-xs bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--color-text-muted)]">
          {count}
        </span>
      </div>
      {isOpen && (
        <div className="ml-4 border-l border-[var(--color-border)]">
          {children}
        </div>
      )}
    </div>
  );
}
