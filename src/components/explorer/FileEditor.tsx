import { LoaderCircle, Pencil, Save, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { tauriApi } from '../../lib/tauri';
import { useUiStore } from '../../stores/uiStore';

const MAX_PREVIEW_BYTES = 1024 * 1024;

export function FileEditor() {
  const editorFile = useUiStore((state) => state.editorFile);
  const setEditorFile = useUiStore((state) => state.setEditorFile);
  const [content, setContent] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
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

        if (cancelled) {
          return;
        }

        const byteLength = new TextEncoder().encode(nextContent).length;

        if (byteLength > MAX_PREVIEW_BYTES) {
          setContent('');
          setDraft('');
          setError('File too large to preview');
          return;
        }

        setContent(nextContent);
        setDraft(nextContent);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : 'Failed to read file';
        setContent('');
        setDraft('');
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadFile();

    return () => {
      cancelled = true;
    };
  }, [editorFile]);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
    }
  }, [isEditing]);

  const lineNumbers = useMemo(() => {
    const totalLines = Math.max((isEditing ? draft : content).split('\n').length, 1);

    return Array.from({ length: totalLines }, (_, index) => index + 1).join('\n');
  }, [content, draft, isEditing]);

  if (!editorFile) {
    return null;
  }

  const fileName = getBaseName(editorFile.path);
  const isDirty = draft !== content;
  const canSave = isEditing && !loading && !error && isDirty;

  const handleClose = () => {
    setEditorFile(null);
  };

  const handleToggleEdit = () => {
    if (isEditing) {
      setDraft(content);
    }

    setSaved(false);
    setIsEditing((current) => !current);
  };

  const handleSave = async () => {
    if (!editorFile || !canSave) {
      return;
    }

    try {
      if (editorFile.isLocal) {
        await tauriApi.localWriteFile(editorFile.path, draft);
      } else {
        await tauriApi.sftpWriteFile(editorFile.sessionId ?? '', editorFile.path, draft);
      }

      setContent(draft);
      setIsEditing(false);
      setSaved(true);

      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = window.setTimeout(() => {
        setSaved(false);
      }, 1500);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save file';
      setError(message);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-secondary)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--color-text-primary)]" title={editorFile.path}>
            {fileName}
          </div>
          <div className="truncate text-[11px] text-[var(--color-text-muted)]" title={editorFile.path}>
            {editorFile.path}
          </div>
        </div>

        {saved && <span className="text-[11px] font-medium text-[var(--color-success)]">Saved!</span>}

        <button
          type="button"
          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleToggleEdit}
          disabled={loading || Boolean(error)}
          title={isEditing ? 'Cancel editing' : 'Edit file'}
        >
          <Pencil className="h-4 w-4" />
        </button>

        {isEditing && (
          <button
            type="button"
            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void handleSave()}
            disabled={!canSave}
            title="Save file"
          >
            <Save className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
          onClick={handleClose}
          title="Close editor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading file…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--color-error)]">
            {error}
          </div>
        ) : isEditing ? (
          <div className="flex h-full min-h-0 overflow-hidden font-mono text-xs">
            <pre className="select-none overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-3 text-right leading-6 text-[var(--color-text-muted)]">
              {lineNumbers}
            </pre>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
              className="h-full flex-1 resize-none bg-[var(--color-bg-secondary)] px-3 py-3 leading-6 text-[var(--color-text-secondary)] outline-none"
            />
          </div>
        ) : (
          <div className="flex h-full min-h-0 overflow-auto font-mono text-xs">
            <pre className="sticky left-0 select-none border-r border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-3 text-right leading-6 text-[var(--color-text-muted)]">
              {lineNumbers}
            </pre>
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words px-3 py-3 leading-6 text-[var(--color-text-secondary)]">
              {content || ' '}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function getBaseName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function isBinaryFile(path: string) {
  const extension = getPathExtension(path);

  return BINARY_FILE_EXTENSIONS.has(extension);
}

function getPathExtension(path: string) {
  const fileName = getBaseName(path);
  const dotIndex = fileName.lastIndexOf('.');

  if (dotIndex === -1) {
    return '';
  }

  return fileName.slice(dotIndex).toLowerCase();
}

const BINARY_FILE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.svg',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
]);
