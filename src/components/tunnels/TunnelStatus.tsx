import type { Tunnel } from '../../types/tunnel';

interface Props {
  tunnel: Tunnel;
}

function getStatusClasses(status: Tunnel['status']) {
  if (status === 'active') {
    return 'bg-[var(--color-success)] text-[var(--color-success)]';
  }

  if (status === 'error') {
    return 'bg-[var(--color-error)] text-[var(--color-error)]';
  }

  return 'bg-[var(--color-text-muted)] text-[var(--color-text-muted)]';
}

function getStatusLabel(tunnel: Tunnel) {
  if (tunnel.status === 'error') {
    return tunnel.errorMessage ? `Error: ${tunnel.errorMessage}` : 'Error';
  }

  if (tunnel.status === 'stopped') {
    return 'Stopped';
  }

  return 'Active';
}

export function TunnelStatus({ tunnel }: Props) {
  const classes = getStatusClasses(tunnel.status);

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)]">
      <span className={`h-2 w-2 rounded-full ${classes.split(' ')[0]}`} />
      <span className={classes.split(' ').slice(1).join(' ')}>{getStatusLabel(tunnel)}</span>
    </span>
  );
}
