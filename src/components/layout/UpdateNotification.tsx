import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { Download, X, ExternalLink, Sparkles } from 'lucide-react';

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseNotes: string;
  downloadUrl: string;
}

const isTauri = () => !!(window as any).__TAURI_INTERNALS__;

export function UpdateNotification() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkForUpdates = useCallback(async () => {
    if (!isTauri()) return;
    setChecking(true);
    try {
      const info = await invoke<UpdateInfo>('check_for_updates');
      if (info.hasUpdate) {
        setUpdate(info);
        setDismissed(false);
      }
    } catch {
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(checkForUpdates, 3000);
    const interval = setInterval(checkForUpdates, 3600000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [checkForUpdates]);

  if (!update || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-[var(--color-accent)] bg-[var(--color-bg-secondary)] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[color-mix(in_srgb,var(--color-accent)_15%,var(--color-bg-secondary))]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--color-accent)]" />
          <span className="text-sm font-medium text-[var(--color-text-primary)]">Update Available</span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--color-text-muted)]">
            v{update.currentVersion}
          </span>
          <span className="text-[var(--color-text-muted)]">→</span>
          <span className="font-medium text-[var(--color-accent)]">
            v{update.latestVersion}
          </span>
        </div>

        {update.releaseNotes && (
          <div className="max-h-24 overflow-y-auto text-xs text-[var(--color-text-secondary)] leading-relaxed border-t border-[var(--color-border)] pt-2">
            {update.releaseNotes.split('\n').slice(0, 8).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {update.downloadUrl && (
            <button
              type="button"
              onClick={() => void shellOpen(update.downloadUrl)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          )}
          <button
            type="button"
            onClick={() => void shellOpen(update.releaseUrl)}
            className="flex items-center justify-center gap-1.5 rounded border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Notes
          </button>
        </div>
      </div>
    </div>
  );
}

export function useUpdateChecker() {
  const [currentVersion, setCurrentVersion] = useState('');

  useEffect(() => {
    if (!isTauri()) return;
    invoke<string>('get_current_version').then(setCurrentVersion).catch(() => {});
  }, []);

  return { currentVersion };
}
