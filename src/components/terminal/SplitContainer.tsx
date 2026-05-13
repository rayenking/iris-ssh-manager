import { useCallback, useMemo, useRef } from 'react';
import { useSplitStore } from '../../stores/splitStore';
import type { SplitNode } from '../../types/split';
import { SplitDivider } from './SplitDivider';
import { TerminalPane } from './TerminalPane';

interface Props {
  node: SplitNode;
  tabId: string;
}

interface PaneRect {
  id: string;
  connectionId: string;
  tabId: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DividerRect {
  key: string;
  direction: 'horizontal' | 'vertical';
  left: number;
  top: number;
  width: number;
  height: number;
  path: number[];
  parentBounds: { left: number; top: number; width: number; height: number };
}

const DIVIDER_PCT = 0.1;

function computeLayout(
  node: SplitNode,
  left: number,
  top: number,
  width: number,
  height: number,
  path: number[],
  panes: PaneRect[],
  dividers: DividerRect[],
) {
  if (node.type === 'leaf') {
    panes.push({ id: node.id, connectionId: node.connectionId, tabId: node.tabId, left, top, width, height });
    return;
  }

  const dividerSize = DIVIDER_PCT;

  if (node.direction === 'horizontal') {
    const firstWidth = (width - dividerSize) * node.ratio;
    const secondWidth = width - dividerSize - firstWidth;

    computeLayout(node.first, left, top, firstWidth, height, [...path, 0], panes, dividers);

    dividers.push({
      key: path.join('-') || 'root',
      direction: 'horizontal',
      left: left + firstWidth,
      top,
      width: dividerSize,
      height,
      path,
      parentBounds: { left, top, width, height },
    });

    computeLayout(node.second, left + firstWidth + dividerSize, top, secondWidth, height, [...path, 1], panes, dividers);
  } else {
    const firstHeight = (height - dividerSize) * node.ratio;
    const secondHeight = height - dividerSize - firstHeight;

    computeLayout(node.first, left, top, width, firstHeight, [...path, 0], panes, dividers);

    dividers.push({
      key: path.join('-') || 'root',
      direction: 'vertical',
      left,
      top: top + firstHeight,
      width,
      height: dividerSize,
      path,
      parentBounds: { left, top, width, height },
    });

    computeLayout(node.second, left, top + firstHeight + dividerSize, width, secondHeight, [...path, 1], panes, dividers);
  }
}

export function SplitContainer({ node, tabId }: Props) {
  const updateRatio = useSplitStore((state) => state.updateRatio);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { panes, dividers } = useMemo(() => {
    const p: PaneRect[] = [];
    const d: DividerRect[] = [];
    computeLayout(node, 0, 0, 100, 100, [], p, d);
    return { panes: p, dividers: d };
  }, [node]);

  const handleResize = useCallback(
    (path: number[], ratio: number) => {
      updateRatio(tabId, path, ratio);
    },
    [tabId, updateRatio],
  );

  return (
    <div ref={containerRef} data-split-root className="relative h-full w-full flex-1 min-h-0 min-w-0">
      {panes.map((pane) => (
        <div
          key={pane.id}
          style={{
            position: 'absolute',
            left: `${pane.left}%`,
            top: `${pane.top}%`,
            width: `${pane.width}%`,
            height: `${pane.height}%`,
          }}
          className="flex"
        >
          <TerminalPane pane={{ type: 'leaf', id: pane.id, connectionId: pane.connectionId, tabId: pane.tabId }} />
        </div>
      ))}

      {dividers.map((div) => (
        <div
          key={`divider-${div.key}`}
          style={{
            position: 'absolute',
            left: `${div.left}%`,
            top: `${div.top}%`,
            width: `${div.width}%`,
            height: `${div.height}%`,
          }}
        >
          <SplitDivider
            direction={div.direction}
            onResize={(ratio) => handleResize(div.path, ratio)}
            parentBounds={div.parentBounds}
          />
        </div>
      ))}
    </div>
  );
}
