export interface FileEntry {
  name: string;
  size: number;
  permissions: string;
  modified: string;
  isDir: boolean;
}

export interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
}

export type TransferDirection = 'upload' | 'download' | 'remote-transfer';
export type TransferStatus = 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';

export interface TransferJob {
  id: string;
  remotePath: string;
  localPath: string;
  direction: TransferDirection;
  status: TransferStatus;
  progress: TransferProgress;
  speedBytesPerSecond: number;
  sessionId: string;
  sourceSessionId?: string;
  destSessionId?: string;
  error?: string;
}
