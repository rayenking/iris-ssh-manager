export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitLeaf {
  type: 'leaf';
  id: string;
  connectionId: string;
  tabId: string;
}

export interface SplitBranch {
  type: 'branch';
  direction: SplitDirection;
  ratio: number;
  first: SplitNode;
  second: SplitNode;
}

export type SplitNode = SplitLeaf | SplitBranch;
