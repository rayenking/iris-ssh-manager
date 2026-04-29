import { Plus, RefreshCw, Square, Trash2, Edit2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTunnel } from '../../hooks/useTunnel';
import type { Tunnel, TunnelConfig } from '../../types/tunnel';
import { TunnelForm } from './TunnelForm';
import { TunnelStatus } from './TunnelStatus';

interface Props {
  sessionId?: string | null;
}

function formatBytesTransferred(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTunnelLabel(tunnel: Tunnel) {
  if (tunnel.type === 'local') return `127.0.0.1:${tunnel.localPort} → ${tunnel.remoteHost}:${tunnel.remotePort}`;
  if (tunnel.type === 'remote') return `remote:${tunnel.remotePort} → ${tunnel.localHost}:${tunnel.localPort}`;
  return `SOCKS5 on 127.0.0.1:${tunnel.localPort}`;
}

function getTypeLabel(type: Tunnel['type']) {
  if (type === 'local') return 'Local';
  if (type === 'remote') return 'Remote';
  return 'Dynamic';
}

function tunnelToConfig(tunnel: Tunnel): TunnelConfig {
  if (tunnel.type === 'local') {
    return { type: 'local', localPort: tunnel.localPort!, remoteHost: tunnel.remoteHost!, remotePort: tunnel.remotePort! };
  }
  if (tunnel.type === 'remote') {
    return { type: 'remote', remotePort: tunnel.remotePort!, localHost: tunnel.localHost!, localPort: tunnel.localPort! };
  }
  return { type: 'dynamic', localPort: tunnel.localPort! };
}

export function TunnelManager({ sessionId }: Props) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTunnel, setEditingTunnel] = useState<Tunnel | null>(null);
  const { tunnels, isLoading, isCreating, error, createTunnel, stopTunnel, removeTunnel, refresh } = useTunnel(sessionId);

  const sortedTunnels = useMemo(
    () => [...tunnels].sort((left, right) => left.type.localeCompare(right.type) || left.id.localeCompare(right.id)),
    [tunnels],
  );

  const handleCreateTunnel = async (config: TunnelConfig) => {
    if (editingTunnel) {
      await stopTunnel(editingTunnel.id);
      await removeTunnel(editingTunnel.id);
    }
    await createTunnel(config);
    setIsFormOpen(false);
    setEditingTunnel(null);
  };

  const handleEdit = (tunnel: Tunnel) => {
    setEditingTunnel(tunnel);
    setIsFormOpen(true);
  };

  const handleDelete = async (tunnel: Tunnel) => {
    if (tunnel.status === 'active') {
      await stopTunnel(tunnel.id);
    }
    await removeTunnel(tunnel.id);
  };

  return (
    <div className="relative flex h-full w-[360px] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-[var(--color-text-primary)]">Tunnels</h2>
          <p className="text-xs text-[var(--color-text-muted)]">Port forwarding</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            disabled={!sessionId}
            onClick={() => { setEditingTunnel(null); setIsFormOpen(true); }}
            className="inline-flex items-center gap-2 rounded bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {!sessionId ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--color-text-muted)]">
          Connect an SSH session to manage tunnels.
        </div>
      ) : sortedTunnels.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--color-text-muted)]">
          No active tunnels
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {sortedTunnels.map((tunnel) => (
            <div key={tunnel.id} className="group rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
                    {getTypeLabel(tunnel.type)}
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-text-primary)]">{getTunnelLabel(tunnel)}</p>
                </div>
                <TunnelStatus tunnel={tunnel} />
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
                <span>{formatBytesTransferred(tunnel.bytesTransferred)} transferred</span>
                <div className="flex items-center gap-1">
                  {tunnel.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => void stopTunnel(tunnel.id)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
                      title="Stop"
                    >
                      <Square className="h-3.5 w-3.5" />
                      Stop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleEdit(tunnel)}
                    className="rounded p-1 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] transition-opacity"
                    title="Edit (recreate with new settings)"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(tunnel)}
                    className="rounded p-1 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--color-hover)] hover:text-[var(--color-error)] transition-opacity"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="border-t border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-error)]">{error}</div>}

      {isFormOpen && (
        <TunnelForm
          isSubmitting={isCreating}
          initialConfig={editingTunnel ? tunnelToConfig(editingTunnel) : undefined}
          onClose={() => { setIsFormOpen(false); setEditingTunnel(null); }}
          onSubmit={handleCreateTunnel}
        />
      )}
    </div>
  );
}
