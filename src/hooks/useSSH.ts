import { Channel } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { tauriApi } from '../lib/tauri';
import type { TabStatus } from '../types/terminal';

type SshDataHandler = (data: number[]) => void;

function isMissingSessionError(error: unknown) {
  return error instanceof Error && error.message.includes('ssh session not found');
}

export function useSSH() {
  const [connectionState, setConnectionState] = useState<TabStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const connect = useCallback(async (connectionId: string, onData: SshDataHandler) => {
    setConnectionState('connecting');
    setError(null);

    const channel = new Channel<number[]>();
    channel.onmessage = onData;

    try {
      const sessionId = await tauriApi.sshConnect(connectionId, channel);
      activeSessionIdRef.current = sessionId;
      setConnectionState('connected');
      return sessionId;
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : 'Failed to connect SSH session';
      setConnectionState('error');
      setError(message);
      throw connectError;
    }
  }, []);

  const disconnect = useCallback(async (sessionId?: string | null) => {
    const targetSessionId = sessionId ?? activeSessionIdRef.current;

    if (!targetSessionId) {
      setConnectionState('disconnected');
      return;
    }

    try {
      await tauriApi.sshDisconnect(targetSessionId);
    } catch (disconnectError) {
      if (!isMissingSessionError(disconnectError)) {
        const message = disconnectError instanceof Error ? disconnectError.message : 'Failed to disconnect SSH session';
        setConnectionState('error');
        setError(message);
        throw disconnectError;
      }
    } finally {
      if (activeSessionIdRef.current === targetSessionId) {
        activeSessionIdRef.current = null;
      }

      setConnectionState((current) => (current === 'error' ? current : 'disconnected'));
    }
  }, []);

  const write = useCallback(async (sessionId: string, data: number[]) => {
    try {
      await tauriApi.sshWrite(sessionId, data);
    } catch (writeError) {
      const message = writeError instanceof Error ? writeError.message : 'Failed to write SSH data';
      setConnectionState('error');
      setError(message);
      throw writeError;
    }
  }, []);

  const resize = useCallback(async (sessionId: string, cols: number, rows: number) => {
    try {
      await tauriApi.sshResize(sessionId, cols, rows);
    } catch (resizeError) {
      const message = resizeError instanceof Error ? resizeError.message : 'Failed to resize SSH session';
      setConnectionState('error');
      setError(message);
      throw resizeError;
    }
  }, []);

  useEffect(() => () => {
    const sessionId = activeSessionIdRef.current;

    if (sessionId) {
      void tauriApi.sshDisconnect(sessionId).catch((disconnectError) => {
        if (!isMissingSessionError(disconnectError)) {
          console.error('Failed to disconnect SSH session on cleanup:', disconnectError);
        }
      });
      activeSessionIdRef.current = null;
    }
  }, []);

  return {
    connect,
    disconnect,
    write,
    resize,
    connectionState,
    error,
  };
}
