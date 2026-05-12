import { Channel } from '@tauri-apps/api/core';
import { useCallback, useRef, useState } from 'react';
import { tauriApi } from '../lib/tauri';
import type { TabStatus } from '../types/terminal';

type SshDataHandler = (data: number[]) => void;

const SSH_STARTUP_TIMEOUT_MS = 60_000;

function isMissingSessionError(error: unknown) {
  return error instanceof Error && error.message.includes('ssh session not found');
}

function withStartupTimeout<T>(promise: Promise<T>, message: string, timeoutMs: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

export function useSSH() {
  const [connectionState, setConnectionState] = useState<TabStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const connect = useCallback(async (connectionId: string, onData: SshDataHandler, cols?: number, rows?: number) => {
    setConnectionState('connecting');
    setError(null);

    const channel = new Channel<number[]>();
    channel.onmessage = (data) => {
      if (data.length === 0) {
        activeSessionIdRef.current = null;
        setConnectionState('disconnected');
        return;
      }

      onData(data);
    };

    try {
      const sessionId = await withStartupTimeout(
        tauriApi.sshConnect(connectionId, channel, cols, rows),
        'SSH startup timed out',
        SSH_STARTUP_TIMEOUT_MS,
      );
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

  const attach = useCallback(async (sessionId: string, onData: SshDataHandler, cols?: number, rows?: number) => {
    setConnectionState('connecting');
    setError(null);

    const channel = new Channel<number[]>();
    channel.onmessage = (data) => {
      if (data.length === 0) {
        activeSessionIdRef.current = null;
        setConnectionState('disconnected');
        return;
      }

      onData(data);
    };

    try {
      await tauriApi.sshAttach(sessionId, channel, cols, rows);
      activeSessionIdRef.current = sessionId;
      setConnectionState('connected');
      return sessionId;
    } catch (attachError) {
      const message = attachError instanceof Error ? attachError.message : 'Failed to attach SSH session';
      setConnectionState('error');
      setError(message);
      throw attachError;
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

  return {
    connect,
    attach,
    disconnect,
    write,
    resize,
    connectionState,
    error,
  };
}
