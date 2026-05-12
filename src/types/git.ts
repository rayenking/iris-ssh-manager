export type GitFileStatus = 'M' | 'A' | 'D' | 'R' | 'C' | '??';

export interface ChangedFile {
  path: string;
  status: GitFileStatus;
  staged: boolean;
}

export interface GitStatusResponse {
  repoRoot: string;
  branch: string | null;
  files: ChangedFile[];
  addedLines: number;
  removedLines: number;
}

export interface GitDiffResponse {
  path: string;
  diff: string;
  isBinary?: boolean;
  tooLarge?: boolean;
}
