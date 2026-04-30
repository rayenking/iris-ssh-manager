import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { useCallback, useEffect, useRef } from 'react';
import { useLocalShell } from '../../hooks/useLocalShell';
import { useTerminalCopyPaste } from '../../hooks/useTerminalCopyPaste';
import { useTerminalStore } from '../../stores/terminalStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import type { TerminalCopyPasteHandle } from './TerminalView';
import type { TabStatus } from '../../types/terminal';

interface Props {
  tabId: string;
  paneId?: string;
  reportTabState?: boolean;
  isFocusedPane?: boolean;
  onStatusChange?: (status: TabStatus) => void;
  onSessionChange?: (sessionId?: string) => void;
  onCopyPasteReady?: (handle: TerminalCopyPasteHandle) => void;
}

function getTerminalTheme() {
  const styles = getComputedStyle(document.documentElement);

  return {
    background: styles.getPropertyValue('--color-terminal-bg').trim() || styles.getPropertyValue('--color-bg-primary').trim(),
    foreground: styles.getPropertyValue('--color-terminal-fg').trim() || styles.getPropertyValue('--color-text-primary').trim(),
    cursor: styles.getPropertyValue('--color-terminal-cursor').trim() || styles.getPropertyValue('--color-text-primary').trim(),
    selectionBackground: styles.getPropertyValue('--color-terminal-selection').trim() || styles.getPropertyValue('--color-hover').trim(),
  };
}

export function LocalTerminalView({
  tabId,
  paneId = tabId,
  reportTabState = true,
  isFocusedPane = true,
  onStatusChange,
  onSessionChange,
  onCopyPasteReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const encoderRef = useRef(new TextEncoder());
  const statusChangeRef = useRef<(status: TabStatus) => void>(() => {});
  const sessionChangeRef = useRef<(sessionId?: string) => void>(() => {});
  const { open, close, write, resize, connectionState, error } = useLocalShell();
  const { updateTabStatus, setTabSessionId, activeTabId: currentActiveTabId } = useTerminalStore();
  const { terminalFont, terminalFontSize, cursorStyle, cursorBlink, scrollbackBuffer } = useSettingsStore();

  const { copySelection, pasteClipboard, hasSelection, attach: attachCopyPaste } = useTerminalCopyPaste({
    terminalRef,
    sessionIdRef,
    encoderRef,
    writeFn: write,
  });

  useEffect(() => {
    onCopyPasteReady?.({ copySelection, pasteClipboard, hasSelection });
  }, [copySelection, pasteClipboard, hasSelection, onCopyPasteReady]);

  useEffect(() => {
    statusChangeRef.current = onStatusChange
      ?? (reportTabState ? (status) => updateTabStatus(tabId, status) : () => {});
  }, [onStatusChange, reportTabState, tabId, updateTabStatus]);

  useEffect(() => {
    sessionChangeRef.current = onSessionChange
      ?? (reportTabState ? (sessionId) => setTabSessionId(tabId, sessionId) : () => {});
  }, [onSessionChange, reportTabState, setTabSessionId, tabId]);

  const emitStatusChange = useCallback((status: TabStatus) => {
    statusChangeRef.current(status);
  }, []);

  const emitSessionChange = useCallback((sessionId?: string) => {
    sessionChangeRef.current(sessionId);
  }, []);

  useEffect(() => {
    const terminalHost = terminalHostRef.current;

    if (!terminalHost) {
      return;
    }

    const terminal = new Terminal({
      allowTransparency: true,
      cursorBlink,
      cursorStyle,
      fontFamily: terminalFont,
      fontSize: terminalFontSize,
      scrollback: scrollbackBuffer,
      theme: getTerminalTheme(),
    });
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(new WebLinksAddon((_event, uri) => {
      void shellOpen(uri);
    }));
    terminal.open(terminalHost);
    attachCopyPaste(terminal);

    try {
      terminal.loadAddon(new WebglAddon());
      console.info('xterm renderer: WebGL');
    } catch (webglError) {
      console.warn('xterm renderer fallback: DOM', webglError);
    }

    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    const handleTerminalData = terminal.onData((value) => {
      const sessionId = sessionIdRef.current;

      if (!sessionId) {
        return;
      }

      const data = Array.from(encoderRef.current.encode(value));
      void write(sessionId, data).catch((writeError) => {
        console.error('Failed to write local terminal data:', writeError);
      });
    });

    let lastCols = terminal.cols;
    let lastRows = terminal.rows;
    let disposed = false;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const syncLocalSize = () => {
      if (disposed) {
        return;
      }

      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }

      resizeTimer = setTimeout(() => {
        resizeTimer = null;

        if (disposed) {
          return;
        }

        const currentTerminal = terminalRef.current;
        const currentSessionId = sessionIdRef.current;
        const currentFitAddon = fitAddonRef.current;

        if (!currentTerminal || !currentSessionId || !currentFitAddon) {
          return;
        }

        currentFitAddon.fit();

        if (currentTerminal.cols === lastCols && currentTerminal.rows === lastRows) {
          return;
        }

        lastCols = currentTerminal.cols;
        lastRows = currentTerminal.rows;

        void resize(currentSessionId, currentTerminal.cols, currentTerminal.rows).catch(() => {});
      }, 50);
    };

    const resizeObserver = new ResizeObserver(() => {
      syncLocalSize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', syncLocalSize);

    return () => {
      disposed = true;
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      window.removeEventListener('resize', syncLocalSize);
      resizeObserver.disconnect();
      handleTerminalData.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [attachCopyPaste, resize, write]);

  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;

    if (!terminal || !fitAddon) {
      return;
    }

    terminal.options.cursorBlink = cursorBlink;
    terminal.options.cursorStyle = cursorStyle;
    terminal.options.fontFamily = terminalFont;
    terminal.options.fontSize = terminalFontSize;
    terminal.options.scrollback = scrollbackBuffer;
    terminal.options.theme = getTerminalTheme();
    terminal.refresh(0, terminal.rows - 1);
    fitAddon.fit();
  }, [cursorBlink, cursorStyle, scrollbackBuffer, terminalFont, terminalFontSize]);

  const isActive = currentActiveTabId === tabId;
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    if (isActive && isFocusedPane && !wasActiveRef.current) {
      requestAnimationFrame(() => {
        const terminal = terminalRef.current;
        const fitAddon = fitAddonRef.current;

        if (!terminal || !fitAddon) {
          return;
        }

        fitAddon.fit();
        terminal.refresh(0, terminal.rows - 1);
        terminal.focus();
      });
    }

    wasActiveRef.current = isActive;
  }, [isActive, isFocusedPane]);

  useEffect(() => {
    if (!isActive || !isFocusedPane) {
      return;
    }

    requestAnimationFrame(() => {
      terminalRef.current?.focus();
    });
  }, [isActive, isFocusedPane]);

  const doOpen = useCallback(async () => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    emitStatusChange('connecting');

    try {
      const sessionId = await open(terminal.cols || 80, terminal.rows || 24, (data) => {
        if (data.length === 0) {
          sessionIdRef.current = null;
          emitSessionChange(undefined);
          return;
        }

        terminalRef.current?.write(new Uint8Array(data));
      });

      sessionIdRef.current = sessionId;
      emitSessionChange(sessionId);
      emitStatusChange('connected');

      requestAnimationFrame(() => {
        const currentTerminal = terminalRef.current;
        const fitAddon = fitAddonRef.current;
        const currentSessionId = sessionIdRef.current;

        if (!currentTerminal || !fitAddon || !currentSessionId) {
          return;
        }

        fitAddon.fit();
        void resize(currentSessionId, currentTerminal.cols, currentTerminal.rows).catch(() => {});
      });
    } catch (openError) {
      console.error('Failed to start local terminal:', openError);
    }
  }, [emitSessionChange, emitStatusChange, open, resize]);

  useEffect(() => {
    void doOpen();

    return () => {
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      emitSessionChange(undefined);
      emitStatusChange('disconnected');
      if (sessionId) {
        void close(sessionId).catch(() => {});
      }
    };
  }, [close, doOpen, emitSessionChange, emitStatusChange]);

  useEffect(() => {
    if (connectionState === 'error') {
      emitStatusChange('error');
      return;
    }

    if (connectionState === 'connected') {
      emitStatusChange('connected');
      return;
    }

    if (connectionState === 'connecting') {
      emitStatusChange('connecting');
      return;
    }

    emitStatusChange('disconnected');
  }, [connectionState, emitStatusChange]);

  useEffect(() => {
    if (!reportTabState) {
      return;
    }

    emitStatusChange(connectionState);
    emitSessionChange(sessionIdRef.current ?? undefined);
  }, [connectionState, emitSessionChange, emitStatusChange, reportTabState]);

  return (
    <div ref={containerRef} data-pane-id={paneId} className="relative flex h-full w-full min-h-0 flex-1 bg-[var(--color-terminal-bg)]">
      <div className="relative flex h-full min-w-0 flex-1 flex-col">
        <div ref={terminalHostRef} className="flex-1 min-h-0 overflow-hidden px-2 py-2" />

        {connectionState === 'connecting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--color-bg-primary)_82%,transparent)]">
            <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-sm text-[var(--color-text-secondary)] shadow-lg">
              Starting...
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-x-4 top-4 z-10 rounded border border-[var(--color-error)] bg-[color-mix(in_srgb,var(--color-error)_10%,var(--color-bg-secondary))] px-4 py-3 shadow-lg">
            <span className="text-sm text-[var(--color-error)]">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
