import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TransferJob } from '../../types/sftp';

interface Props {
  jobs: TransferJob[];
  onCancel: (jobId: string) => void;
}

export function TransferQueue({ jobs, onCancel }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const visibleJobs = useMemo(() => [...jobs].reverse(), [jobs]);

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <button
        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
        onClick={() => setIsCollapsed((current) => !current)}
        type="button"
      >
        <span>Transfer Queue ({jobs.length})</span>
        {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {!isCollapsed && (
        <div className="max-h-56 overflow-y-auto border-t border-[var(--color-border)]">
          {visibleJobs.length === 0 ? (
            <div className="px-4 py-4 text-sm text-[var(--color-text-muted)]">No transfers yet.</div>
          ) : (
            visibleJobs.map((job) => {
              const fileName = (job.direction === 'upload' ? job.localPath : job.remotePath)
                .split(/[\\/]/)
                .filter(Boolean)
                .pop() ?? 'transfer';

              return (
                <div key={job.id} className="border-b border-[var(--color-border)] px-4 py-3 text-sm last:border-b-0">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[var(--color-text-primary)]">{fileName}</div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        {job.direction === 'upload' ? '↑ Upload' : '↓ Download'} · {job.status}
                      </div>
                    </div>
                    <button
                      className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={job.status !== 'queued'}
                      onClick={() => onCancel(job.id)}
                      title={job.status === 'queued' ? 'Cancel queued transfer' : 'Active transfers cannot be cancelled in this build'}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mb-2 h-2 overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]">
                    <div
                      className="h-full bg-[var(--color-accent)] transition-[width]"
                      style={{ width: `${Math.min(job.progress.percentage, 100)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                    <span>{job.progress.percentage.toFixed(0)}%</span>
                    <span>{formatSpeed(job.speedBytesPerSecond)}</span>
                  </div>

                  {job.error && <div className="mt-2 text-xs text-[var(--color-error)]">{job.error}</div>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function formatSpeed(bytesPerSecond: number) {
  if (!bytesPerSecond) {
    return '—';
  }

  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(0)} B/s`;
  }

  const kilobytes = bytesPerSecond / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB/s`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB/s`;
}
