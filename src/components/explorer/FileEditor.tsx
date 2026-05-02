import { LoaderCircle, Pencil, Save, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tauriApi } from '../../lib/tauri';
import { useUiStore } from '../../stores/uiStore';

const MAX_PREVIEW_BYTES = 1024 * 1024;
const MIN_WIDTH = 280;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 400;

export function FileEditor() {
  const editorFile = useUiStore((state) => state.editorFile);
  const setEditorFile = useUiStore((state) => state.setEditorFile);
  const [content, setContent] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_WIDTH);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!editorFile) {
      setContent('');
      setDraft('');
      setError(null);
      setIsEditing(false);
      setSaved(false);
      return;
    }

    if (isBinaryFile(editorFile.path)) {
      setContent('');
      setDraft('');
      setError('Binary files cannot be previewed or edited.');
      setIsEditing(false);
      return;
    }

    let cancelled = false;

    const loadFile = async () => {
      setLoading(true);
      setError(null);
      setIsEditing(false);
      setSaved(false);

      try {
        const nextContent = editorFile.isLocal
          ? await tauriApi.localReadFile(editorFile.path)
          : await tauriApi.sftpReadFile(editorFile.sessionId ?? '', editorFile.path);

        if (cancelled) return;

        const byteLength = new TextEncoder().encode(nextContent).length;
        if (byteLength > MAX_PREVIEW_BYTES) {
          setContent('');
          setDraft('');
          setError('File too large to preview (>1MB)');
          return;
        }

        setContent(nextContent);
        setDraft(nextContent);
      } catch (loadError) {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : 'Failed to read file';
        setContent('');
        setDraft('');
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadFile();
    return () => { cancelled = true; };
  }, [editorFile]);

  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  const handleDividerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [width]);

  const handleDividerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const delta = startXRef.current - e.clientX;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
    setWidth(next);
  }, []);

  const handleDividerUp = useCallback((e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const lineNumbers = useMemo(() => {
    const text = isEditing ? draft : content;
    const count = Math.max(text.split('\n').length, 1);
    return Array.from({ length: count }, (_, i) => i + 1).join('\n');
  }, [content, draft, isEditing]);

  if (!editorFile) return null;

  const fileName = getBaseName(editorFile.path);
  const isDirty = draft !== content;
  const canSave = isEditing && !loading && !error && isDirty;

  const handleClose = () => setEditorFile(null);

  const handleToggleEdit = () => {
    if (isEditing) setDraft(content);
    setSaved(false);
    setIsEditing((c) => !c);
  };

  const handleSave = async () => {
    if (!editorFile || !canSave) return;
    try {
      if (editorFile.isLocal) {
        await tauriApi.localWriteFile(editorFile.path, draft);
      } else {
        await tauriApi.sftpWriteFile(editorFile.sessionId ?? '', editorFile.path, draft);
      }
      setContent(draft);
      setIsEditing(false);
      setSaved(true);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => setSaved(false), 1500);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save file';
      setError(message);
    }
  };

  return (
    <div className="flex h-full shrink-0" style={{ width }}>
      <div
        className="w-1 cursor-col-resize hover:bg-[var(--color-accent)] active:bg-[var(--color-accent)] transition-colors"
        onPointerDown={handleDividerDown}
        onPointerMove={handleDividerMove}
        onPointerUp={handleDividerUp}
      />

      <div className="flex flex-1 min-w-0 flex-col border-l border-[var(--color-border)] editor-material">
        <div className="flex items-center gap-2 border-b border-[#1e272e] px-3 py-2 bg-[#263238]">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[#eeffff]" title={editorFile.path}>
              {fileName}
            </div>
            <div className="truncate text-[11px] text-[#546e7a]" title={editorFile.path}>
              {editorFile.path}
            </div>
          </div>

          {saved && <span className="text-[11px] font-medium text-[#c3e88d]">Saved!</span>}

          <button
            type="button"
            className={`rounded p-1.5 transition-colors ${isEditing ? 'bg-[#37474f] text-[#82aaff]' : 'text-[#546e7a] hover:bg-[#37474f] hover:text-[#eeffff]'} disabled:cursor-not-allowed disabled:opacity-40`}
            onClick={handleToggleEdit}
            disabled={loading || Boolean(error)}
            title={isEditing ? 'Cancel editing' : 'Edit file'}
          >
            <Pencil className="h-4 w-4" />
          </button>

          {isEditing && (
            <button
              type="button"
              className="rounded p-1.5 text-[#546e7a] transition-colors hover:bg-[#37474f] hover:text-[#c3e88d] disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void handleSave()}
              disabled={!canSave}
              title="Save file"
            >
              <Save className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            className="rounded p-1.5 text-[#546e7a] transition-colors hover:bg-[#37474f] hover:text-[#eeffff]"
            onClick={handleClose}
            title="Close editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden bg-[#263238]">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-[#546e7a]">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[#f07178]">
              {error}
            </div>
          ) : isEditing ? (
            <div className="flex h-full min-h-0 overflow-hidden font-mono text-[13px]">
              <pre className="select-none overflow-hidden border-r border-[#1e272e] bg-[#1e272e] px-3 py-3 text-right leading-[1.6] text-[#37474f]">
                {lineNumbers}
              </pre>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                className="h-full flex-1 resize-none bg-[#263238] px-3 py-3 leading-[1.6] text-[#eeffff] outline-none caret-[#ffcb6b]"
              />
            </div>
          ) : (
            <div className="flex h-full min-h-0 overflow-auto font-mono text-[13px]">
              <pre className="sticky left-0 select-none border-r border-[#1e272e] bg-[#1e272e] px-3 py-3 text-right leading-[1.6] text-[#37474f]">
                {lineNumbers}
              </pre>
              <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words px-3 py-3 leading-[1.6] text-[#eeffff]">
                {content || ' '}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getBaseName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function isBinaryFile(path: string) {
  const ext = getPathExtension(path);
  return BINARY_FILE_EXTENSIONS.has(ext);
}

function getPathExtension(path: string) {
  const name = getBaseName(path);
  const dot = name.lastIndexOf('.');
  if (dot === -1) return '';
  return name.slice(dot).toLowerCase();
}

const BINARY_FILE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.mp3', '.mp4', '.avi', '.mov', '.webm',
  '.zip', '.tar', '.gz', '.7z', '.rar', '.bz2', '.xz',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.pdf', '.woff', '.woff2', '.ttf', '.eot',
  '.class', '.o', '.pyc',
]);
