import { useCallback, useRef } from 'react';
import type { SplitDirection } from '../../types/split';

interface Props {
  direction: SplitDirection;
  onResize: (ratio: number) => void;
}

function clampRatio(ratio: number) {
  return Math.min(0.85, Math.max(0.15, ratio));
}

export function SplitDivider({ direction, onResize }: Props) {
  const dividerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();

      const parent = dividerRef.current?.parentElement;

      if (!parent) {
        return;
      }

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const rect = parent.getBoundingClientRect();

        if (direction === 'horizontal') {
          onResize(clampRatio((moveEvent.clientX - rect.left) / rect.width));
          return;
        }

        onResize(clampRatio((moveEvent.clientY - rect.top) / rect.height));
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [direction, onResize],
  );

  return (
    <div
      ref={dividerRef}
      role="separator"
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      onMouseDown={handleMouseDown}
      className={direction === 'horizontal'
        ? 'w-1 shrink-0 cursor-col-resize bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)]'
        : 'h-1 shrink-0 cursor-row-resize bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)]'}
    />
  );
}
