import { useCallback } from 'react';
import { useSplitStore } from '../../stores/splitStore';
import type { SplitNode } from '../../types/split';
import { SplitDivider } from './SplitDivider';
import { TerminalPane } from './TerminalPane';

interface Props {
  node: SplitNode;
  tabId: string;
  path?: number[];
}

export function SplitContainer({ node, tabId, path = [] }: Props) {
  const updateRatio = useSplitStore((state) => state.updateRatio);

  const handleResize = useCallback(
    (ratio: number) => {
      updateRatio(tabId, path, ratio);
    },
    [path, tabId, updateRatio],
  );

  if (node.type === 'leaf') {
    return <TerminalPane pane={node} />;
  }

  return (
    <div className={`flex h-full min-h-0 min-w-0 flex-1 ${node.direction === 'horizontal' ? 'flex-row' : 'flex-col'}`}>
      <div style={{ flex: `${node.ratio} 1 0` }} className="flex min-h-0 min-w-0">
        <SplitContainer node={node.first} tabId={tabId} path={[...path, 0]} />
      </div>

      <SplitDivider direction={node.direction} onResize={handleResize} />

      <div style={{ flex: `${1 - node.ratio} 1 0` }} className="flex min-h-0 min-w-0">
        <SplitContainer node={node.second} tabId={tabId} path={[...path, 1]} />
      </div>
    </div>
  );
}
