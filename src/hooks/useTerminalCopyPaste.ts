import { useCallback } from 'react';
import type { Terminal } from '@xterm/xterm';

interface UseTerminalCopyPasteOptions {
  terminalRef: React.MutableRefObject<Terminal | null>;
  sessionIdRef: React.MutableRefObject<string | null>;
  encoderRef: React.MutableRefObject<TextEncoder>;
  writeFn: (sessionId: string, data: number[]) => Promise<void>;
}

export function useTerminalCopyPaste({
  terminalRef,
  sessionIdRef,
  encoderRef,
  writeFn,
}: UseTerminalCopyPasteOptions) {
  const hasSelection = useCallback(() => {
    return (terminalRef.current?.getSelection()?.length ?? 0) > 0;
  }, [terminalRef]);

  const copySelection = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const selection = terminal.getSelection();
    if (selection) {
      void navigator.clipboard.writeText(selection);
    }
  }, [terminalRef]);

  const pasteClipboard = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const data = Array.from(encoderRef.current.encode(text));
        await writeFn(sessionId, data);
      }
    } catch (err) {
      console.error('Failed to paste from clipboard:', err);
    }
  }, [sessionIdRef, encoderRef, writeFn]);

  const attachSelectionCopy = useCallback((terminal: Terminal) => {
    terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      if (selection) {
        void navigator.clipboard.writeText(selection);
      }
    });
  }, []);

  const attachKeyHandler = useCallback((terminal: Terminal) => {
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown') return true;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        copySelection();
        return false;
      }

      if (ctrl && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
        e.preventDefault();
        void pasteClipboard();
        return false;
      }

      return true;
    });
  }, [copySelection, pasteClipboard]);

  const attach = useCallback((terminal: Terminal) => {
    attachSelectionCopy(terminal);
    attachKeyHandler(terminal);
  }, [attachSelectionCopy, attachKeyHandler]);

  return {
    copySelection,
    pasteClipboard,
    hasSelection,
    attach,
  };
}
