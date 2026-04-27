import { useCallback, useEffect, useState } from 'react';
import { tauriApi } from '../lib/tauri';
import type { Tunnel, TunnelConfig } from '../types/tunnel';

const POLL_INTERVAL_MS = 2000;

export function useTunnel(sessionId?: string | null) {
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setTunnels([]);
      setError(null);
      return;
    }

    setIsLoading(true);

    try {
      const activeTunnels = await tauriApi.listTunnels(sessionId);
      setTunnels(activeTunnels);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to load tunnels');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  const createTunnel = useCallback(
    async (config: TunnelConfig) => {
      if (!sessionId) {
        throw new Error('SSH session is not connected');
      }

      setIsCreating(true);

      try {
        const tunnelId = await tauriApi.createTunnel(sessionId, config);
        const activeTunnels = await tauriApi.listTunnels(sessionId);
        setTunnels(activeTunnels);
        setError(null);
        return tunnelId;
      } catch (createError) {
        const message = createError instanceof Error ? createError.message : 'Failed to create tunnel';
        setError(message);
        throw createError;
      } finally {
        setIsCreating(false);
      }
    },
    [sessionId],
  );

  const stopTunnel = useCallback(
    async (tunnelId: string) => {
      await tauriApi.stopTunnel(tunnelId);

      if (sessionId) {
        const activeTunnels = await tauriApi.listTunnels(sessionId);
        setTunnels(activeTunnels);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    void refresh();

    if (!sessionId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refresh, sessionId]);

  return {
    tunnels,
    isLoading,
    isCreating,
    error,
    createTunnel,
    stopTunnel,
    refresh,
  };
}
