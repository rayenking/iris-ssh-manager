import { AlertCircle, FileCode2, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { tauriApi } from '../../lib/tauri';
import { useUiStore } from '../../stores/uiStore';
import type { GitDiffResponse } from '../../types/git';
import type { ReviewDiffTab as ReviewDiffTabType } from '../../types/terminal';
import { CodeDiffViewer } from './CodeDiffViewer';

interface Props {
  tab: ReviewDiffTabType;
}

export function ReviewDiffTab({ tab }: Props) {
  const setReviewDiffFile = useUiStore((state) => state.setReviewDiffFile);
  const [diffData, setDiffData] = useState<GitDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadDiff = async () => {
      setLoading(true);
      setError(null);

      try {
        const nextDiff = await tauriApi.getGitDiff(tab.repoRoot, tab.filePath);
        if (!cancelled) {
          setDiffData(nextDiff);
        }
      } catch (nextError) {
        if (!cancelled) {
          setDiffData(null);
          setError(nextError instanceof Error ? nextError.message : 'Gagal memuat diff.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDiff();

    return () => {
      cancelled = true;
    };
  }, [tab.filePath, tab.connectionId]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-[var(--color-bg-secondary)]">
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[var(--color-text-primary)]">{tab.filePath}</div>
            <div className="mt-1 text-xs text-[var(--color-text-muted)]">Code Review Diff</div>
          </div>
          <button
            type="button"
            onClick={() => setReviewDiffFile(null)}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
            title="Close diff panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-[var(--color-bg-primary)]">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div className="max-w-sm space-y-3 text-[var(--color-text-muted)]">
              <AlertCircle className="mx-auto h-8 w-8 text-[var(--color-warning)]" />
              <p className="text-sm">{error}</p>
            </div>
          </div>
        ) : diffData?.tooLarge ? (
          <div className="p-4 text-sm text-[var(--color-text-muted)]">Diff terlalu besar untuk dirender di tab ini.</div>
        ) : diffData?.isBinary ? (
          <div className="p-4 text-sm text-[var(--color-text-muted)]">File biner terdeteksi. Diff teks tidak tersedia.</div>
        ) : diffData?.diff ? (
          <CodeDiffViewer content={diffData.diff} filePath={tab.filePath} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div className="max-w-sm space-y-3 text-[var(--color-text-muted)]">
              <FileCode2 className="mx-auto h-8 w-8" />
              <p className="text-sm">Tidak ada diff tekstual untuk file ini.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
