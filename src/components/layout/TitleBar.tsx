import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    if (!isTauri) return;

    try { setIsMac(platform() === 'macos'); } catch {}

    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized);

    let unlisten: (() => void) | null = null;
    win.onResized(() => {
      win.isMaximized().then(setMaximized);
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  const handleMinimize = () => { if (isTauri) getCurrentWindow().minimize(); };
  const handleMaximize = () => { if (isTauri) getCurrentWindow().toggleMaximize(); };
  const handleClose = () => { if (isTauri) getCurrentWindow().close(); };

  return (
    <div
      data-tauri-drag-region
      className="flex h-8 shrink-0 select-none items-center border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
    >
      {isMac && <div className="w-[72px] shrink-0" />}

      <div data-tauri-drag-region className="flex flex-1 items-center gap-2 pl-3">
        <img src="/assets/logo.png" alt="" className="h-4 w-4 pointer-events-none" draggable={false} />
        <span className="text-xs font-medium text-[var(--color-text-secondary)] pointer-events-none">
          Iris SSH Manager
        </span>
      </div>

      {!isMac && (
        <div className="flex h-full">
          <button
            type="button"
            onClick={handleMinimize}
            className="flex h-full w-11 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleMaximize}
            className="flex h-full w-11 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
          >
            {maximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-full w-11 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-red-600 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
