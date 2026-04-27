import { useCallback, useRef } from 'react';
import type { SplitDirection } from '../../types/split';

interface Props {
  direction: SplitDirection;
  onResize: (ratio: number) => void;
  parentBounds: { left: number; top: number; width: number; height: number };
}

function clampRatio(ratio: number) {
  return Math.min(0.85, Math.max(0.15, ratio));
}

export function SplitDivider({ direction, onResize, parentBounds }: Props) {
  const dividerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();

      const splitRoot = dividerRef.current?.closest('[data-split-root]') as HTMLElement | null;

      if (!splitRoot) {
        return;
      }

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const rootRect = splitRoot.getBoundingClientRect();
        const absLeft = rootRect.left + (parentBounds.left / 100) * rootRect.width;
        const absTop = rootRect.top + (parentBounds.top / 100) * rootRect.height;
        const absWidth = (parentBounds.width / 100) * rootRect.width;
        const absHeight = (parentBounds.height / 100) * rootRect.height;

        if (direction === 'horizontal') {
          onResize(clampRatio((moveEvent.clientX - absLeft) / absWidth));
          return;
        }

        onResize(clampRatio((moveEvent.clientY - absTop) / absHeight));
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [direction, onResize, parentBounds],
  );

  return (
    <div
      ref={dividerRef}
      role="separator"
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      onMouseDown={handleMouseDown}
      className={`${direction === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize'} h-full w-full bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)]`}
    />
  );
}
