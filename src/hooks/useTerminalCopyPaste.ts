import { useCallback, useEffect, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

interface UseTerminalCopyPasteOptions {
  terminalRef: React.MutableRefObject<Terminal | null>;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  sessionIdRef: React.MutableRefObject<string | null>;
  encoderRef: React.MutableRefObject<TextEncoder>;
  writeFn: (sessionId: string, data: number[]) => Promise<void>;
}

export function useTerminalCopyPaste({
  terminalRef,
  containerRef,
  sessionIdRef,
  encoderRef,
  writeFn,
}: UseTerminalCopyPasteOptions) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });
  const hasSelectionRef = useRef(false);

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

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const onSelectionChange = terminal.onSelectionChange(() => {
      hasSelectionRef.current = (terminal.getSelection()?.length ?? 0) > 0;
    });

    return () => onSelectionChange.dispose();
  }, [terminalRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
      });
    };

    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (e.key === 'C' || e.key === 'c') {
          e.preventDefault();
          e.stopPropagation();
          copySelection();
        } else if (e.key === 'V' || e.key === 'v') {
          e.preventDefault();
          e.stopPropagation();
          void pasteClipboard();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown, true);
    return () => container.removeEventListener('keydown', handleKeyDown, true);
  }, [containerRef, copySelection, pasteClipboard]);

  useEffect(() => {
    if (!contextMenu.visible) return;

    const handleClick = () => closeContextMenu();
    window.addEventListener('click', handleClick);
    window.addEventListener('contextmenu', handleClick);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('contextmenu', handleClick);
    };
  }, [contextMenu.visible, closeContextMenu]);

  return {
    contextMenu,
    closeContextMenu,
    copySelection,
    pasteClipboard,
    hasSelectionRef,
  };
}
