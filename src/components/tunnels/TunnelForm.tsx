import { useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import type { TunnelConfig, TunnelType } from '../../types/tunnel';

interface Props {
  isSubmitting: boolean;
  initialConfig?: TunnelConfig;
  onClose: () => void;
  onSubmit: (config: TunnelConfig) => Promise<void>;
}

type TunnelFormState = {
  type: TunnelType;
  localPort: string;
  remoteHost: string;
  remotePort: string;
  localHost: string;
};

function configToState(config?: TunnelConfig): TunnelFormState {
  if (!config) return { type: 'local', localPort: '8080', remoteHost: 'localhost', remotePort: '80', localHost: '127.0.0.1' };
  if (config.type === 'local') return { type: 'local', localPort: String(config.localPort), remoteHost: config.remoteHost, remotePort: String(config.remotePort), localHost: '127.0.0.1' };
  if (config.type === 'remote') return { type: 'remote', localPort: String(config.localPort), remoteHost: 'localhost', remotePort: String(config.remotePort), localHost: config.localHost };
  return { type: 'dynamic', localPort: String(config.localPort), remoteHost: 'localhost', remotePort: '80', localHost: '127.0.0.1' };
}

export function TunnelForm({ isSubmitting, initialConfig, onClose, onSubmit }: Props) {
  const [formState, setFormState] = useState<TunnelFormState>(() => configToState(initialConfig));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      if (formState.type === 'local') {
        await onSubmit({
          type: 'local',
          localPort: Number(formState.localPort),
          remoteHost: formState.remoteHost,
          remotePort: Number(formState.remotePort),
        });
        return;
      }

      if (formState.type === 'remote') {
        await onSubmit({
          type: 'remote',
          remotePort: Number(formState.remotePort),
          localHost: formState.localHost,
          localPort: Number(formState.localPort),
        });
        return;
      }

      await onSubmit({
        type: 'dynamic',
        localPort: Number(formState.localPort),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{initialConfig ? 'Edit Tunnel' : 'Add Tunnel'}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">Tunnel Type</label>
            <select
              value={formState.type}
              onChange={(event) => setFormState((current) => ({ ...current, type: event.target.value as TunnelType }))}
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="local">Local Forward</option>
              <option value="remote">Remote Forward</option>
              <option value="dynamic">Dynamic Forward</option>
            </select>
          </div>

          {formState.type === 'local' && (
            <>
              <PortField label="Local Port" value={formState.localPort} onChange={(value) => setFormState((current) => ({ ...current, localPort: value }))} />
              <TextField label="Remote Host" value={formState.remoteHost} onChange={(value) => setFormState((current) => ({ ...current, remoteHost: value }))} />
              <PortField label="Remote Port" value={formState.remotePort} onChange={(value) => setFormState((current) => ({ ...current, remotePort: value }))} />
            </>
          )}

          {formState.type === 'remote' && (
            <>
              <PortField label="Remote Port" value={formState.remotePort} onChange={(value) => setFormState((current) => ({ ...current, remotePort: value }))} />
              <TextField label="Local Host" value={formState.localHost} onChange={(value) => setFormState((current) => ({ ...current, localHost: value }))} />
              <PortField label="Local Port" value={formState.localPort} onChange={(value) => setFormState((current) => ({ ...current, localPort: value }))} />
            </>
          )}

          {formState.type === 'dynamic' && (
            <PortField label="Local Port" value={formState.localPort} onChange={(value) => setFormState((current) => ({ ...current, localPort: value }))} />
          )}

          {error && (
            <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-[var(--color-border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Saving…' : initialConfig ? 'Save Tunnel' : 'Create Tunnel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function TextField({ label, value, onChange }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">{label}</label>
      <input
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </div>
  );
}

function PortField({ label, value, onChange }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">{label}</label>
      <input
        required
        min={1}
        max={65535}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </div>
  );
}
