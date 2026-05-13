import { Channel } from '@tauri-apps/api/core';
import { useCallback, useRef, useState } from 'react';
import { tauriApi } from '../lib/tauri';
import type { TabStatus } from '../types/terminal';

type LocalShellDataHandler = (data: number[]) => void;

const LOCAL_SHELL_STARTUP_TIMEOUT_MS = 10_000;

function isMissingSessionError(error: unknown) {
  return error instanceof Error && error.message.includes('local shell session not found');
}

function withStartupTimeout<T>(promise: Promise<T>, message: string, timeoutMs: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

export function useLocalShell() {
  const [connectionState, setConnectionState] = useState<TabStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const open = useCallback(async (cols: number, rows: number, onData: LocalShellDataHandler, cwd?: string) => {
    setConnectionState('connecting');
    setError(null);

    const channel = new Channel<number[]>();
    channel.onmessage = (data) => {
      if (data.length === 0) {
        activeSessionIdRef.current = null;
        setConnectionState('disconnected');
      }

      onData(data);
    };

    try {
      const sessionId = await withStartupTimeout(
        tauriApi.localShellOpen(channel, cols, rows, cwd),
        'Local shell startup timed out',
        LOCAL_SHELL_STARTUP_TIMEOUT_MS,
      );
      activeSessionIdRef.current = sessionId;
      setConnectionState('connected');
      return sessionId;
    } catch (openError) {
      const message = openError instanceof Error ? openError.message : 'Failed to start local shell';
      setConnectionState('error');
      setError(message);
      throw openError;
    }
  }, []);

  const attach = useCallback(async (sessionId: string, cols: number, rows: number, onData: LocalShellDataHandler) => {
    setConnectionState('connecting');
    setError(null);

    const channel = new Channel<number[]>();
    channel.onmessage = (data) => {
      if (data.length === 0) {
        activeSessionIdRef.current = null;
        setConnectionState('disconnected');
      }

      onData(data);
    };

    try {
      await tauriApi.localShellAttach(channel, sessionId, cols, rows);
      activeSessionIdRef.current = sessionId;
      setConnectionState('connected');
      return sessionId;
    } catch (attachError) {
      const message = attachError instanceof Error ? attachError.message : 'Failed to attach local shell';
      setConnectionState('error');
      setError(message);
      throw attachError;
    }
  }, []);

  const close = useCallback(async (sessionId?: string | null) => {
    const targetSessionId = sessionId ?? activeSessionIdRef.current;

    if (!targetSessionId) {
      setConnectionState('disconnected');
      return;
    }

    try {
      await tauriApi.localShellDisconnect(targetSessionId);
    } catch (closeError) {
      if (!isMissingSessionError(closeError)) {
        const message = closeError instanceof Error ? closeError.message : 'Failed to close local shell';
        setConnectionState('error');
        setError(message);
        throw closeError;
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
      await tauriApi.localShellWrite(sessionId, data);
    } catch (writeError) {
      const message = writeError instanceof Error ? writeError.message : 'Failed to write local shell data';
      setConnectionState('error');
      setError(message);
      throw writeError;
    }
  }, []);

  const resize = useCallback(async (sessionId: string, cols: number, rows: number) => {
    try {
      await tauriApi.localShellResize(sessionId, cols, rows);
    } catch (resizeError) {
      const message = resizeError instanceof Error ? resizeError.message : 'Failed to resize local shell';
      setConnectionState('error');
      setError(message);
      throw resizeError;
    }
  }, []);

  return {
    open,
    attach,
    write,
    resize,
    close,
    connectionState,
    error,
  };
}
