import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSSH } from '../../hooks/useSSH';
import { useTerminalCopyPaste } from '../../hooks/useTerminalCopyPaste';
import { useTerminalStore } from '../../stores/terminalStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { TunnelManager } from '../tunnels/TunnelManager';
import { RotateCw, Network } from 'lucide-react';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import type { TabStatus } from '../../types/terminal';

export interface TerminalCopyPasteHandle {
  copySelection: () => void;
  pasteClipboard: () => Promise<void>;
  hasSelection: () => boolean;
}

interface Props {
  connectionId: string;
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

export function TerminalView({
  connectionId,
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
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCwdRef = useRef<string | null>(null);
  const isReconnectRef = useRef(false);
  const statusChangeRef = useRef<(status: TabStatus) => void>(() => {});
  const sessionChangeRef = useRef<(sessionId?: string) => void>(() => {});
  const [tunnelPanelOpen, setTunnelPanelOpen] = useState(false);
  const { connect, disconnect, write, resize, connectionState, error } = useSSH();
  const { updateTabStatus, setTabSessionId } = useTerminalStore();
  const { terminalFont, terminalFontSize, cursorStyle, cursorBlink, scrollbackBuffer, autoReconnect } = useSettingsStore();

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

    // Delay initial fit to ensure the container has been laid out by the browser
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    let inputBuffer = '';

    const handleTerminalData = terminal.onData((value) => {
      const sessionId = sessionIdRef.current;

      if (!sessionId) {
        return;
      }

      if (value === '\r' || value === '\n') {
        const trimmed = inputBuffer.trim();
        const cdMatch = trimmed.match(/^cd\s+(.+)/);
        if (cdMatch) {
          const target = cdMatch[1].replace(/^~/, '$HOME').replace(/["']/g, '');
          if (target.startsWith('/')) {
            lastCwdRef.current = target;
          } else if (target === '-') {
          } else if (lastCwdRef.current) {
            lastCwdRef.current = lastCwdRef.current.replace(/\/$/, '') + '/' + target;
          }
        } else if (trimmed === 'cd') {
          lastCwdRef.current = null;
        }
        inputBuffer = '';
      } else if (value === '\x7f') {
        inputBuffer = inputBuffer.slice(0, -1);
      } else if (value.length === 1 && value >= ' ') {
        inputBuffer += value;
      }

      const data = Array.from(encoderRef.current.encode(value));
      void write(sessionId, data).catch((writeError) => {
        console.error('Failed to write terminal data:', writeError);
      });
    });

    let lastCols = terminal.cols;
    let lastRows = terminal.rows;
    let disposed = false;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const syncRemoteSize = () => {
      if (disposed) return;

      if (resizeTimer) clearTimeout(resizeTimer);

      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        if (disposed) return;

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

    const applyTerminalSettings = () => {
      const currentTerminal = terminalRef.current;

      if (!currentTerminal) {
        return;
      }

      currentTerminal.options.cursorBlink = cursorBlink;
      currentTerminal.options.cursorStyle = cursorStyle;
      currentTerminal.options.fontFamily = terminalFont;
      currentTerminal.options.fontSize = terminalFontSize;
      currentTerminal.options.scrollback = scrollbackBuffer;
      currentTerminal.options.theme = getTerminalTheme();
      currentTerminal.refresh(0, currentTerminal.rows - 1);
      fitAddon.fit();
    };

    applyTerminalSettings();

    const resizeObserver = new ResizeObserver(() => {
      syncRemoteSize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', syncRemoteSize);

    return () => {
      disposed = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', syncRemoteSize);
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

  // Re-render xterm canvas when this tab becomes active again.
  // WebGL context is lost when the container is hidden (display:none),
  // so we need to fit + refresh when the tab is shown again.
  const { activeTabId: currentActiveTabId } = useTerminalStore();
  const isActive = currentActiveTabId === tabId;
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    if (isActive && isFocusedPane && !wasActiveRef.current) {
      requestAnimationFrame(() => {
        const terminal = terminalRef.current;
        const fitAddon = fitAddonRef.current;
        if (!terminal || !fitAddon) return;
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

  const doConnect = useCallback(async () => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    emitStatusChange('connecting');

    try {
      const initialCols = terminal.cols || 80;
      const initialRows = terminal.rows || 24;

      const sessionId = await connect(connectionId, (data) => {
        const bytes = new Uint8Array(data);
        terminalRef.current?.write(bytes);

        const text = new TextDecoder().decode(bytes);
        const osc7Match = text.match(/\x1b\]7;file:\/\/[^/]*(\/[^\x07\x1b]*)/);
        if (osc7Match?.[1]) {
          lastCwdRef.current = decodeURIComponent(osc7Match[1]);
        }
      }, initialCols, initialRows);

      sessionIdRef.current = sessionId;
      emitSessionChange(sessionId);
      emitStatusChange('connected');
      reconnectAttemptRef.current = 0;

      const encoder = encoderRef.current;

      if (isReconnectRef.current) {
        setTimeout(() => {
          const sid = sessionIdRef.current;
          if (!sid) return;

          let cmd = ' PROMPT_COMMAND=\'printf "\\e]7;file://%s%s\\a" "${HOSTNAME:-localhost}" "$(pwd)"\'';
          if (lastCwdRef.current) {
            cmd += `; cd ${shellEscape(lastCwdRef.current)} 2>/dev/null`;
          }
          cmd += '; clear\n';
          void write(sid, Array.from(encoder.encode(cmd))).catch(() => {});
        }, 500);
      }

    } catch (connectError) {
      console.error('Failed to connect SSH terminal:', connectError);
    }
  }, [connect, connectionId, emitSessionChange, emitStatusChange, resize, write]);

  const handleReconnect = useCallback(() => {
    const oldSessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    emitSessionChange(undefined);
    if (oldSessionId) {
      void disconnect(oldSessionId).catch(() => {});
    }
    isReconnectRef.current = true;
    terminalRef.current?.write('\r\n\x1b[33mReconnecting...\x1b[0m\r\n');
    void doConnect();
  }, [disconnect, doConnect, emitSessionChange]);

  useEffect(() => {
    void doConnect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      emitSessionChange(undefined);
      emitStatusChange('disconnected');
      if (sessionId) {
        void disconnect(sessionId).catch(() => {});
      }
    };
  }, [disconnect, doConnect, emitSessionChange, emitStatusChange]);

  useEffect(() => {
    if (connectionState !== 'disconnected' || !autoReconnect) return;
    if (!sessionIdRef.current && reconnectAttemptRef.current === 0) return;

    const attempt = reconnectAttemptRef.current + 1;
    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
    reconnectAttemptRef.current = attempt;

    terminalRef.current?.write(`\r\n\x1b[33mAuto-reconnect in ${delay / 1000}s (attempt ${attempt})...\x1b[0m\r\n`);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      handleReconnect();
    }, delay);

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connectionState, autoReconnect, handleReconnect]);

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
      <div className="relative flex-1 min-w-0 flex flex-col h-full">
        <div ref={terminalHostRef} className="flex-1 min-h-0 overflow-hidden px-2 py-2" />

        {connectionState === 'connected' && (
          <button
            type="button"
            onClick={() => setTunnelPanelOpen(prev => !prev)}
            className={`absolute top-2 right-2 z-10 rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] transition-colors ${tunnelPanelOpen ? 'bg-[var(--color-hover)] text-[var(--color-text-primary)]' : ''}`}
            title="Toggle tunnels panel"
          >
            <Network className="w-4 h-4" />
          </button>
        )}

        {connectionState === 'connecting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--color-bg-primary)_82%,transparent)]">
            <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-sm text-[var(--color-text-secondary)] shadow-lg">
              Connecting...
            </div>
          </div>
        )}

        {connectionState === 'disconnected' && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--color-bg-primary)_78%,transparent)]">
            <div className="flex flex-col items-center gap-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-6 py-4 shadow-lg">
              <span className="text-sm text-[var(--color-text-muted)]">Disconnected</span>
              <button
                type="button"
                onClick={handleReconnect}
                className="inline-flex items-center gap-2 rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                <RotateCw className="w-4 h-4" />
                Reconnect
              </button>
              {autoReconnect && (
                <span className="text-xs text-[var(--color-text-muted)]">Auto-reconnect is enabled</span>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between rounded border border-[var(--color-error)] bg-[color-mix(in_srgb,var(--color-error)_10%,var(--color-bg-secondary))] px-4 py-3 shadow-lg">
            <span className="text-sm text-[var(--color-error)]">{error}</span>
            <button
              type="button"
              onClick={handleReconnect}
              className="ml-4 inline-flex items-center gap-1.5 rounded bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}
      </div>

      {tunnelPanelOpen && <TunnelManager sessionId={sessionIdRef.current} />}
    </div>
  );
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
