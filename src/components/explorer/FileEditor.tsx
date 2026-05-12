import { Eye, Code, LoaderCircle, Pencil, Save, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tauriApi } from '../../lib/tauri';
import { useUiStore } from '../../stores/uiStore';
import { CodeMirrorMiniEditor } from './CodeMirrorMiniEditor';

const MAX_PREVIEW_BYTES = 1024 * 1024;
const MIN_WIDTH = 280;
const MAX_WIDTH = Number.POSITIVE_INFINITY;
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
  const [mdPreview, setMdPreview] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
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

  if (!editorFile) return null;

  const fileName = getBaseName(editorFile.path);
  const isDirty = draft !== content;
  const canSave = isEditing && !loading && !error && isDirty;
  const isMarkdown = /\.(md|markdown)$/i.test(editorFile.path);

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

      <div className="flex flex-1 min-w-0 flex-col border-l border-[#252526] editor-material bg-[#111111]">
        <div className="flex items-center gap-2 border-b border-[#252526] bg-[#161616] px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[#d4d4d4]" title={editorFile.path}>
              {fileName}
            </div>
            <div className="truncate text-[11px] text-[#6e7681]" title={editorFile.path}>
              {editorFile.path}
            </div>
          </div>

          {saved && <span className="text-[11px] font-medium text-[#7ee787]">Saved!</span>}

          <button
            type="button"
            className={`rounded p-1.5 transition-colors ${isEditing ? 'bg-[#21262d] text-[#58a6ff]' : 'text-[#6e7681] hover:bg-[#21262d] hover:text-[#d4d4d4]'} disabled:cursor-not-allowed disabled:opacity-40`}
            onClick={handleToggleEdit}
            disabled={loading || Boolean(error)}
            title={isEditing ? 'Cancel editing' : 'Edit file'}
          >
            <Pencil className="h-4 w-4" />
          </button>

          {isEditing && (
            <button
              type="button"
              className="rounded p-1.5 text-[#6e7681] transition-colors hover:bg-[#21262d] hover:text-[#7ee787] disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void handleSave()}
              disabled={!canSave}
              title="Save file"
            >
              <Save className="h-4 w-4" />
            </button>
          )}

          {isMarkdown && !isEditing && (
            <div className="flex rounded bg-[#0d1117] p-0.5">
              <button
                type="button"
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${!mdPreview ? 'bg-[#21262d] text-[#d4d4d4]' : 'text-[#6e7681] hover:text-[#d4d4d4]'}`}
                onClick={() => setMdPreview(false)}
              >
                <Code className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${mdPreview ? 'bg-[#21262d] text-[#d4d4d4]' : 'text-[#6e7681] hover:text-[#d4d4d4]'}`}
                onClick={() => setMdPreview(true)}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            className="rounded p-1.5 text-[#6e7681] transition-colors hover:bg-[#21262d] hover:text-[#d4d4d4]"
            onClick={handleClose}
            title="Close editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden bg-[#111111]">
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
            <CodeMirrorMiniEditor
              value={draft}
              filePath={editorFile.path}
              readOnly={false}
              onChange={setDraft}
            />
          ) : mdPreview && isMarkdown ? (
            <div className="h-full min-h-0 overflow-auto px-5 py-4 text-[14px] leading-[1.7] text-[#eeffff] md-preview">
              <MarkdownPreview content={content} />
            </div>
          ) : (
            <CodeMirrorMiniEditor
              value={content}
              filePath={editorFile.path}
              readOnly
            />
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

function MarkdownPreview({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);
  return <>{blocks}</>;
}

function parseMarkdownBlocks(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const lang = line.replace(/^\s*```/, '').trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      nodes.push(
        <pre key={key++} className="my-2 overflow-x-auto rounded bg-[#1e272e] px-4 py-3 text-[13px] leading-[1.6] text-[#c3e88d]">
          {lang && <div className="mb-1 text-[11px] text-[#546e7a]">{lang}</div>}
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^(#{1,6})\s/)![1].length;
      const text = line.replace(/^#{1,6}\s+/, '');
      const sizes = ['text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm', 'text-sm'];
      const margins = ['mt-6 mb-3', 'mt-5 mb-2', 'mt-4 mb-2', 'mt-3 mb-1', 'mt-2 mb-1', 'mt-2 mb-1'];
      nodes.push(
        <div key={key++} className={`font-bold text-[#ffcb6b] ${sizes[level - 1]} ${margins[level - 1]} ${level <= 2 ? 'border-b border-[#37474f] pb-1' : ''}`}>
          {renderInlineMarkdown(text)}
        </div>
      );
      i += 1;
      continue;
    }

    if (/^\s*[-*_]{3,}\s*$/.test(line)) {
      nodes.push(<hr key={key++} className="my-4 border-[#37474f]" />);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      nodes.push(
        <blockquote key={key++} className="my-2 border-l-2 border-[#546e7a] pl-3 italic text-[#546e7a]">
          {quoteLines.map((ql, qi) => <div key={qi}>{renderInlineMarkdown(ql)}</div>)}
        </blockquote>
      );
      continue;
    }

    if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      const ordered = /^\s*\d+\.\s/.test(line);
      while (i < lines.length && (/^\s*[-*+]\s/.test(lines[i]) || /^\s*\d+\.\s/.test(lines[i]))) {
        listItems.push(lines[i].replace(/^\s*[-*+]\s|^\s*\d+\.\s/, ''));
        i += 1;
      }
      const Tag = ordered ? 'ol' : 'ul';
      nodes.push(
        <Tag key={key++} className={`my-2 pl-6 ${ordered ? 'list-decimal' : 'list-disc'} text-[#eeffff]`}>
          {listItems.map((li, li_i) => <li key={li_i} className="my-0.5">{renderInlineMarkdown(li)}</li>)}
        </Tag>
      );
      continue;
    }

    if (line.trim() === '') {
      nodes.push(<div key={key++} className="h-3" />);
      i += 1;
      continue;
    }

    nodes.push(<p key={key++} className="my-1 text-[#eeffff]">{renderInlineMarkdown(line)}</p>);
    i += 1;
  }

  return nodes;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let k = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(<code key={k++} className="rounded bg-[#1e272e] px-1.5 py-0.5 text-[12px] text-[#c3e88d]">{codeMatch[1]}</code>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={k++} className="font-bold text-[#eeffff]">{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^[*_](.+?)[*_]/);
    if (italicMatch) {
      parts.push(<em key={k++} className="italic text-[#b2ccd6]">{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(<a key={k++} className="text-[#82aaff] underline" href={linkMatch[2]} target="_blank" rel="noopener noreferrer">{linkMatch[1]}</a>);
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const imgMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      parts.push(<span key={k++} className="text-[#546e7a]">[image: {imgMatch[1] || imgMatch[2]}]</span>);
      remaining = remaining.slice(imgMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/[`*_\[!]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    }
    if (nextSpecial === 0) {
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

const BINARY_FILE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.mp3', '.mp4', '.avi', '.mov', '.webm',
  '.zip', '.tar', '.gz', '.7z', '.rar', '.bz2', '.xz',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.pdf', '.woff', '.woff2', '.ttf', '.eot',
  '.class', '.o', '.pyc',
]);
