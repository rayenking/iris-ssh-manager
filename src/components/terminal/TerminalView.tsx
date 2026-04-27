import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';
import { useSSH } from '../../hooks/useSSH';
import { useTerminalStore } from '../../stores/terminalStore';

interface Props {
  connectionId: string;
  tabId: string;
}

function getTerminalTheme() {
  const styles = getComputedStyle(document.documentElement);

  return {
    background: styles.getPropertyValue('--color-bg-primary').trim(),
    foreground: styles.getPropertyValue('--color-text-primary').trim(),
    cursor: styles.getPropertyValue('--color-text-primary').trim(),
    selectionBackground: styles.getPropertyValue('--color-hover').trim(),
  };
}

export function TerminalView({ connectionId, tabId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const encoderRef = useRef(new TextEncoder());
  const { connect, disconnect, write, resize, connectionState, error } = useSSH();
  const { updateTabStatus, setTabSessionId } = useTerminalStore();

  useEffect(() => {
    const terminalHost = terminalHostRef.current;

    if (!terminalHost) {
      return;
    }

    const terminal = new Terminal({
      allowTransparency: true,
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      scrollback: 5000,
      theme: getTerminalTheme(),
    });
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.open(terminalHost);

    try {
      terminal.loadAddon(new WebglAddon());
      console.info('xterm renderer: WebGL');
    } catch (webglError) {
      console.warn('xterm renderer fallback: DOM', webglError);
    }

    fitAddon.fit();

    const handleTerminalData = terminal.onData((value) => {
      const sessionId = sessionIdRef.current;

      if (!sessionId) {
        return;
      }

      const data = Array.from(encoderRef.current.encode(value));
      void write(sessionId, data).catch((writeError) => {
        console.error('Failed to write terminal data:', writeError);
      });
    });

    const syncRemoteSize = () => {
      const currentTerminal = terminalRef.current;
      const currentSessionId = sessionIdRef.current;
      const currentFitAddon = fitAddonRef.current;

      if (!currentTerminal || !currentSessionId || !currentFitAddon) {
        return;
      }

      currentFitAddon.fit();
      void resize(currentSessionId, currentTerminal.cols, currentTerminal.rows).catch((resizeError) => {
        console.error('Failed to resize terminal:', resizeError);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      syncRemoteSize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', syncRemoteSize);

    return () => {
      window.removeEventListener('resize', syncRemoteSize);
      resizeObserver.disconnect();
      handleTerminalData.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [resize, write]);

  useEffect(() => {
    let isDisposed = false;

    async function startSession() {
      const terminal = terminalRef.current;

      if (!terminal) {
        return;
      }

      updateTabStatus(tabId, 'connecting');

      try {
        const sessionId = await connect(connectionId, (data) => {
          terminalRef.current?.write(new Uint8Array(data));
        });

        if (isDisposed) {
          await disconnect(sessionId);
          return;
        }

        sessionIdRef.current = sessionId;
        setTabSessionId(tabId, sessionId);
        updateTabStatus(tabId, 'connected');

        requestAnimationFrame(() => {
          const currentTerminal = terminalRef.current;
          const fitAddon = fitAddonRef.current;

          if (!currentTerminal || !fitAddon || !sessionIdRef.current) {
            return;
          }

          fitAddon.fit();
          void resize(sessionIdRef.current, currentTerminal.cols, currentTerminal.rows).catch((resizeError) => {
            console.error('Failed to send initial terminal size:', resizeError);
          });
        });
      } catch (connectError) {
        console.error('Failed to connect SSH terminal:', connectError);
      }
    }

    void startSession();

    return () => {
      isDisposed = true;
      const sessionId = sessionIdRef.current;

      sessionIdRef.current = null;
      setTabSessionId(tabId, undefined);
      updateTabStatus(tabId, 'disconnected');

      if (sessionId) {
        void disconnect(sessionId).catch((disconnectError) => {
          console.error('Failed to disconnect SSH terminal on unmount:', disconnectError);
        });
      }
    };
  }, [connect, connectionId, disconnect, resize, setTabSessionId, tabId, updateTabStatus]);

  useEffect(() => {
    if (connectionState === 'error') {
      updateTabStatus(tabId, 'error');
      return;
    }

    if (connectionState === 'connected') {
      updateTabStatus(tabId, 'connected');
      return;
    }

    if (connectionState === 'connecting') {
      updateTabStatus(tabId, 'connecting');
      return;
    }

    updateTabStatus(tabId, 'disconnected');
  }, [connectionState, tabId, updateTabStatus]);

  return (
    <div ref={containerRef} className="relative flex h-full min-h-0 flex-1 bg-[var(--color-bg-primary)]">
      <div ref={terminalHostRef} className="h-full w-full px-4 py-3" />

      {connectionState === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--color-bg-primary)_82%,transparent)]">
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-sm text-[var(--color-text-secondary)] shadow-lg">
            Connecting...
          </div>
        </div>
      )}

      {connectionState === 'disconnected' && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--color-bg-primary)_78%,transparent)]">
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-sm text-[var(--color-text-muted)] shadow-lg">
            Disconnected
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-4 top-4 rounded border border-[var(--color-error)] bg-[color-mix(in_srgb,var(--color-error)_10%,var(--color-bg-secondary))] px-4 py-3 text-sm text-[var(--color-error)] shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
