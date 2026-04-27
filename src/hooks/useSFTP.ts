import { Channel } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { tauriApi } from '../lib/tauri';
import type { FileEntry, TransferDirection, TransferJob, TransferProgress } from '../types/sftp';

const EMPTY_PROGRESS: TransferProgress = {
  bytesTransferred: 0,
  totalBytes: 0,
  percentage: 0,
};

interface QueueRequest {
  direction: TransferDirection;
  localPath: string;
  remotePath: string;
  sessionId: string;
}

export function useSFTP() {
  const [jobs, setJobs] = useState<TransferJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobsRef = useRef<TransferJob[]>([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const updateJob = useCallback((jobId: string, updater: (job: TransferJob) => TransferJob) => {
    setJobs((currentJobs) => currentJobs.map((job) => (job.id === jobId ? updater(job) : job)));
  }, []);

  const listDir = useCallback(async (sessionId: string, path: string) => {
    setIsLoading(true);
    setError(null);

    try {
      return await tauriApi.sftpListDir(sessionId, path);
    } catch (listError) {
      const message = listError instanceof Error ? listError.message : 'Failed to list remote directory';
      setError(message);
      throw listError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const listLocalDir = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);

    try {
      return await tauriApi.localListDir(path);
    } catch (listError) {
      const message = listError instanceof Error ? listError.message : 'Failed to list local directory';
      setError(message);
      throw listError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const mkdir = useCallback(async (sessionId: string, path: string) => {
    setError(null);
    try {
      await tauriApi.sftpMkdir(sessionId, path);
    } catch (mkdirError) {
      const message = mkdirError instanceof Error ? mkdirError.message : 'Failed to create remote folder';
      setError(message);
      throw mkdirError;
    }
  }, []);

  const remove = useCallback(async (sessionId: string, path: string) => {
    setError(null);
    try {
      await tauriApi.sftpDelete(sessionId, path);
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : 'Failed to delete remote item';
      setError(message);
      throw removeError;
    }
  }, []);

  const rename = useCallback(async (sessionId: string, oldPath: string, newPath: string) => {
    setError(null);
    try {
      await tauriApi.sftpRename(sessionId, oldPath, newPath);
    } catch (renameError) {
      const message = renameError instanceof Error ? renameError.message : 'Failed to rename remote item';
      setError(message);
      throw renameError;
    }
  }, []);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) {
      return;
    }

    const nextJob = jobsRef.current.find((job) => job.status === 'queued');
    if (!nextJob) {
      return;
    }

    isProcessingRef.current = true;
    const startedAt = performance.now();
    updateJob(nextJob.id, (job) => ({ ...job, status: 'active', error: undefined }));

    const channel = new Channel<TransferProgress>();
    channel.onmessage = (progress) => {
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
      updateJob(nextJob.id, (job) => ({
        ...job,
        progress,
        speedBytesPerSecond: progress.bytesTransferred / elapsedSeconds,
      }));
    };

    try {
      if (nextJob.direction === 'upload') {
        await tauriApi.sftpUpload(nextJob.sessionId, nextJob.localPath, nextJob.remotePath, channel);
      } else {
        await tauriApi.sftpDownload(nextJob.sessionId, nextJob.remotePath, nextJob.localPath, channel);
      }

      updateJob(nextJob.id, (job) => ({
        ...job,
        status: 'completed',
        progress: {
          bytesTransferred: job.progress.totalBytes || job.progress.bytesTransferred,
          totalBytes: job.progress.totalBytes,
          percentage: 100,
        },
      }));
    } catch (queueError) {
      const message = queueError instanceof Error ? queueError.message : 'Transfer failed';
      setError(message);
      updateJob(nextJob.id, (job) => ({ ...job, status: 'failed', error: message }));
    } finally {
      isProcessingRef.current = false;
      queueMicrotask(() => {
        void processQueue();
      });
    }
  }, [updateJob]);

  const enqueueTransfer = useCallback((request: QueueRequest) => {
    const job: TransferJob = {
      id: crypto.randomUUID(),
      direction: request.direction,
      localPath: request.localPath,
      remotePath: request.remotePath,
      status: 'queued',
      progress: EMPTY_PROGRESS,
      speedBytesPerSecond: 0,
      sessionId: request.sessionId,
    };

    setJobs((currentJobs) => [...currentJobs, job]);
    queueMicrotask(() => {
      void processQueue();
    });
  }, [processQueue]);

  const upload = useCallback((sessionId: string, localPath: string, remotePath: string) => {
    enqueueTransfer({ direction: 'upload', localPath, remotePath, sessionId });
  }, [enqueueTransfer]);

  const download = useCallback((sessionId: string, remotePath: string, localPath: string) => {
    enqueueTransfer({ direction: 'download', localPath, remotePath, sessionId });
  }, [enqueueTransfer]);

  const cancelTransfer = useCallback((jobId: string) => {
    setJobs((currentJobs) => currentJobs.map((job) => {
      if (job.id !== jobId) {
        return job;
      }

      if (job.status === 'queued') {
        return { ...job, status: 'cancelled' };
      }

      return job;
    }));
  }, []);

  return {
    jobs,
    error,
    isLoading,
    listDir,
    listLocalDir,
    upload,
    download,
    mkdir,
    remove,
    rename,
    cancelTransfer,
  };
}
