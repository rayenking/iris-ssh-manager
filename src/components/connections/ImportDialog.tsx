import { useState, useEffect, useCallback } from 'react';
import { X, Upload, Loader2, CheckSquare, Square, AlertCircle } from 'lucide-react';
import { tauriApi } from '../../lib/tauri';
import { useConnectionStore } from '../../stores/connectionStore';
import type { ParsedSshHost } from '../../types/connection';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportDialog({ isOpen, onClose }: Props) {
  const { fetchConnections } = useConnectionStore();
  const [hosts, setHosts] = useState<ParsedSshHost[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const loadHosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccessCount(null);
    try {
      const parsed = await tauriApi.parseSshConfig();
      setHosts(parsed);
      setSelected(new Set(parsed.map(h => h.host_alias)));
    } catch (err) {
      setError(String(err));
      setHosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadHosts();
    } else {
      setHosts([]);
      setSelected(new Set());
      setError(null);
      setSuccessCount(null);
    }
  }, [isOpen, loadHosts]);

  if (!isOpen) return null;

  const toggleHost = (alias: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(alias)) {
        next.delete(alias);
      } else {
        next.add(alias);
      }
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(hosts.map(h => h.host_alias)));
  const deselectAll = () => setSelected(new Set());

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setError(null);
    try {
      const created = await tauriApi.importSshConfig(null, Array.from(selected));
      setSuccessCount(created.length);
      await fetchConnections();
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  };

  const hasExtras = (h: ParsedSshHost) =>
    h.proxy_jump || h.local_forwards.length > 0 || h.remote_forwards.length > 0 || h.dynamic_forwards.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] shrink-0">
          <h2 className="text-sm font-medium text-[var(--color-text-primary)]">
            Import from SSH Config
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-8 text-[var(--color-text-muted)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Parsing SSH config...</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-error)] text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successCount !== null && (
            <div className="p-3 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-success,#22c55e)] text-sm text-center">
              Imported {successCount} connection{successCount !== 1 ? 's' : ''} successfully
            </div>
          )}

          {!loading && !error && hosts.length === 0 && successCount === null && (
            <div className="text-[var(--color-text-muted)] text-sm text-center py-8">
              No hosts found in SSH config
            </div>
          )}

          {!loading && hosts.length > 0 && successCount === null && (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-[var(--color-text-muted)]">
                  {hosts.length} host{hosts.length !== 1 ? 's' : ''} found &middot; {selected.size} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="text-xs px-2 py-1 text-[var(--color-accent)] hover:bg-[var(--color-hover)] rounded transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={deselectAll}
                    className="text-xs px-2 py-1 text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] rounded transition-colors"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                {hosts.map(host => (
                  <div
                    key={host.host_alias}
                    onClick={() => toggleHost(host.host_alias)}
                    className="flex items-start gap-3 p-2 rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  >
                    <div className="mt-0.5 shrink-0 text-[var(--color-accent)]">
                      {selected.has(host.host_alias) ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4 text-[var(--color-text-muted)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                        {host.host_alias}
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)] truncate">
                        {host.username && <span>{host.username}@</span>}
                        {host.hostname ?? host.host_alias}
                        {host.port && <span>:{host.port}</span>}
                        {host.identity_file && (
                          <span className="ml-2" title={host.identity_file}>
                            key: ...{host.identity_file.split('/').pop()}
                          </span>
                        )}
                      </div>
                      {hasExtras(host) && (
                        <div className="text-xs text-[var(--color-text-muted)] mt-0.5 opacity-60 italic">
                          {host.proxy_jump && <span>ProxyJump: {host.proxy_jump}</span>}
                          {host.local_forwards.length > 0 && (
                            <span className="ml-2">{host.local_forwards.length} local fwd</span>
                          )}
                          {host.remote_forwards.length > 0 && (
                            <span className="ml-2">{host.remote_forwards.length} remote fwd</span>
                          )}
                          {host.dynamic_forwards.length > 0 && (
                            <span className="ml-2">{host.dynamic_forwards.length} dynamic fwd</span>
                          )}
                          <span className="ml-1">(not imported)</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-border)] shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing || selected.size === 0 || successCount !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[var(--color-accent)] text-white rounded hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {importing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Import Selected ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
