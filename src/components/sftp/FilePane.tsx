import { ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { FileEntryIcon } from '../file-icons/FileEntryIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import type { FileEntry } from '../../types/sftp';

type SortField = 'name' | 'size' | 'modified';
type SortDirection = 'asc' | 'desc';

export type ContextAction = 'delete' | 'rename' | 'copy' | 'paste' | 'new-folder' | 'select-all' | 'deselect-all' | 'toggle-select' | 'download' | 'upload' | 'refresh';

interface ContextMenuState {
  x: number;
  y: number;
  targetName: string | null;
}

export interface PaneTarget {
  id: string;
  label: string;
}

interface Props {
  title: string;
  paneId: 'local' | 'remote';
  path: string;
  currentTargetId?: string;
  availableTargets?: PaneTarget[];
  onSwitchTarget?: (targetId: string) => void;
  entries: FileEntry[];
  selectedNames: string[];
  sortField: SortField;
  sortDirection: SortDirection;
  isLoading: boolean;
  checkboxMode?: boolean;
  clipboardPane?: string | null;
  clipboardNames?: string[];
  history?: string[];
  historyIndex?: number;
  onNavigate: (path: string) => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onSelect: (name: string, event: MouseEvent<HTMLButtonElement>) => void;
  onSort: (field: SortField) => void;
  onDrop?: (fileNames: string[], sourcePane: string) => void;
  onContextAction?: (action: ContextAction, targetName: string | null) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onToggleCheckboxMode?: () => void;
}

export function FilePane({
  title,
  paneId,
  path,
  entries,
  selectedNames,
  sortField,
  sortDirection,
  isLoading,
  checkboxMode = false,
  clipboardPane,
  clipboardNames = [],
  history = [],
  historyIndex = 0,
  onNavigate,
  onGoBack,
  onGoForward,
  onSelect,
  onSort,
  onDrop,
  onContextAction,
  onSelectAll,
  onDeselectAll,
  onToggleCheckboxMode,
  currentTargetId,
  availableTargets = [],
  onSwitchTarget,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editingPath, setEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const pathInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: globalThis.MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const handleContextMenu = (e: MouseEvent<HTMLButtonElement>, entryName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedNames.includes(entryName)) {
      onSelect(entryName, e);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, targetName: entryName });
  };

  const handleBgContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, targetName: null });
  };

  const fireAction = (action: ContextAction) => {
    onContextAction?.(action, contextMenu?.targetName ?? null);
    setContextMenu(null);
  };

  const hasPasteSource = clipboardNames.length > 0 && clipboardPane && clipboardPane !== paneId;

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, entry: FileEntry) => {
    const names = selectedNames.includes(entry.name) ? selectedNames : [entry.name];
    event.dataTransfer.setData('application/x-sftp-pane', paneId);
    event.dataTransfer.setData('application/x-sftp-files', JSON.stringify(names));
    event.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const sourcePane = event.dataTransfer.types.includes('application/x-sftp-pane');
    if (!sourcePane) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const sourcePane = event.dataTransfer.getData('application/x-sftp-pane');
    const filesJson = event.dataTransfer.getData('application/x-sftp-files');
    if (!sourcePane || !filesJson || sourcePane === paneId) return;
    try {
      const fileNames = JSON.parse(filesJson) as string[];
      onDrop?.(fileNames, sourcePane);
    } catch {}
  };

  const sortedEntries = useMemo(() => {
    const nextEntries = showHidden ? [...entries] : entries.filter((e) => !e.name.startsWith('.'));
    nextEntries.sort((left, right) => {
      if (left.isDir !== right.isDir) {
        return left.isDir ? -1 : 1;
      }

      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortField === 'size') {
        return (left.size - right.size) * direction;
      }

      if (sortField === 'modified') {
        return left.modified.localeCompare(right.modified) * direction;
      }

      return left.name.localeCompare(right.name) * direction;
    });
    return nextEntries;
  }, [entries, showHidden, sortDirection, sortField]);

  const breadcrumbs = useMemo(() => buildBreadcrumbs(path), [path]);
  const parentPath = getParentPath(path);
  const canGoBack = onGoBack && historyIndex > 0;
  const canGoForward = onGoForward && historyIndex < history.length - 1;

  return (
    <div
      className={`flex h-full min-h-0 flex-col border bg-[var(--color-bg-secondary)] transition-colors ${dragOver ? 'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-bg-secondary))]' : 'border-[var(--color-border)]'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="shrink-0 border-b border-[var(--color-border)] px-3 py-2">
        <div className="mb-2 flex items-center gap-1">
          {availableTargets.length > 0 && onSwitchTarget ? (
            <select
              className="text-xs font-semibold uppercase tracking-[0.18em] bg-transparent text-[var(--color-text-muted)] border-none outline-none cursor-pointer hover:text-[var(--color-text-primary)]"
              value={currentTargetId ?? ''}
              onChange={(e) => onSwitchTarget(e.target.value)}
            >
              {availableTargets.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{title}</span>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            <button
              className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={!canGoBack}
              onClick={onGoBack}
              title="Previous folder"
              type="button"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={!canGoForward}
              onClick={onGoForward}
              title="Next folder"
              type="button"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={!parentPath}
              onClick={() => parentPath && onNavigate(parentPath)}
              title="Open parent folder"
              type="button"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />
            <button
              className={`rounded p-1 transition-colors hover:bg-[var(--color-hover)] ${showHidden ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
              onClick={() => setShowHidden((v) => !v)}
              title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
              type="button"
            >
              {showHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        {editingPath ? (
          <input
            ref={pathInputRef}
            className="w-full rounded border border-[var(--color-accent)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-sm text-[var(--color-text-primary)] outline-none"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const trimmed = pathInput.trim();
                if (trimmed) onNavigate(trimmed);
                setEditingPath(false);
              } else if (e.key === 'Escape') {
                setEditingPath(false);
              }
            }}
            onBlur={() => setEditingPath(false)}
          />
        ) : (
          <div
            className="flex flex-wrap items-center gap-1 text-sm text-[var(--color-text-secondary)] min-w-0 cursor-text rounded px-1 py-0.5 hover:bg-[var(--color-bg-tertiary)]"
            onClick={() => {
              setPathInput(path);
              setEditingPath(true);
              requestAnimationFrame(() => pathInputRef.current?.select());
            }}
            title="Click to type a path"
          >
            {breadcrumbs.map((segment, index) => (
              <div key={`${segment.path}-${index}`} className="flex items-center gap-1 min-w-0">
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />}
                <button
                  className="truncate rounded px-1.5 py-0.5 hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
                  onClick={(e) => { e.stopPropagation(); onNavigate(segment.path); }}
                  type="button"
                >
                  {segment.label}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`shrink-0 grid gap-2 border-b border-[var(--color-border)] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)] ${checkboxMode ? 'grid-cols-[20px_minmax(0,1fr)_80px_140px_80px]' : 'grid-cols-[minmax(0,1fr)_80px_140px_80px]'}`}>
        {checkboxMode && (
          <button
            className="flex items-center justify-center hover:text-[var(--color-text-primary)]"
            onClick={() => {
              const allSelected = sortedEntries.length > 0 && sortedEntries.every((e) => selectedNames.includes(e.name));
              if (allSelected) {
                onDeselectAll?.();
              } else {
                onSelectAll?.();
              }
            }}
            type="button"
          >
            <div className={`h-4 w-4 rounded border flex items-center justify-center ${sortedEntries.length > 0 && sortedEntries.every((e) => selectedNames.includes(e.name)) ? 'bg-[var(--color-accent)] border-[var(--color-accent)]' : selectedNames.length > 0 ? 'bg-[var(--color-accent)]/50 border-[var(--color-accent)]' : 'border-[var(--color-border)]'}`}>
              {sortedEntries.length > 0 && sortedEntries.every((e) => selectedNames.includes(e.name)) && <span className="text-white text-xs leading-none">✓</span>}
              {selectedNames.length > 0 && !sortedEntries.every((e) => selectedNames.includes(e.name)) && <span className="text-white text-xs leading-none">–</span>}
            </div>
          </button>
        )}
        <button className="text-left hover:text-[var(--color-text-primary)]" onClick={() => onSort('name')} type="button">
          Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
        </button>
        <button className="text-right hover:text-[var(--color-text-primary)]" onClick={() => onSort('size')} type="button">
          Size {sortField === 'size' && (sortDirection === 'asc' ? '↑' : '↓')}
        </button>
        <button className="text-left hover:text-[var(--color-text-primary)]" onClick={() => onSort('modified')} type="button">
          Modified {sortField === 'modified' && (sortDirection === 'asc' ? '↑' : '↓')}
        </button>
        <div>Perms</div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto" onContextMenu={handleBgContextMenu}>
        {parentPath && (
          <button
            className="grid w-full grid-cols-[minmax(0,1fr)_80px_140px_80px] gap-2 border-b border-[var(--color-border)] px-3 py-2 text-left text-sm hover:bg-[var(--color-hover)]"
            onClick={() => onNavigate(parentPath)}
            type="button"
          >
            <div className="truncate text-[var(--color-text-secondary)]">..</div>
            <div />
            <div />
            <div />
          </button>
        )}

        {sortedEntries.map((entry) => {
          const isSelected = selectedNames.includes(entry.name);

          return (
            <button
              key={entry.name}
              draggable
              onDragStart={(event) => handleDragStart(event, entry)}
              onContextMenu={(event) => handleContextMenu(event, entry.name)}
              className={`grid w-full gap-2 border-b border-[var(--color-border)] px-3 py-2 text-left text-sm transition-colors cursor-grab active:cursor-grabbing ${
                checkboxMode ? 'grid-cols-[20px_minmax(0,1fr)_80px_140px_80px]' : 'grid-cols-[minmax(0,1fr)_80px_140px_80px]'
              } ${isSelected ? 'bg-[var(--color-hover)] text-[var(--color-text-primary)]' : 'hover:bg-[var(--color-bg-tertiary)]'}`}
              onClick={(event) => onSelect(entry.name, event)}
              onDoubleClick={() => {
                if (entry.isDir) {
                  onNavigate(joinPath(path, entry.name));
                }
              }}
              type="button"
            >
              {checkboxMode && (
                <div className="flex items-center justify-center">
                  <div className={`h-4 w-4 rounded border flex items-center justify-center ${isSelected ? 'bg-[var(--color-accent)] border-[var(--color-accent)]' : 'border-[var(--color-border)]'}`}>
                    {isSelected && <span className="text-white text-xs leading-none">✓</span>}
                  </div>
                </div>
              )}
              <div className="flex min-w-0 items-center gap-2">
                <FileEntryIcon name={entry.name} isDir={entry.isDir} fullPath={joinPath(path, entry.name)} className="h-4 w-4" />
                <span className="truncate">{entry.name}</span>
              </div>
              <div className="truncate text-right text-[var(--color-text-secondary)]">{entry.isDir ? '—' : formatBytes(entry.size)}</div>
              <div className="truncate text-[var(--color-text-secondary)]">{formatModified(entry.modified)}</div>
              <div className="truncate text-[var(--color-text-secondary)]">{entry.permissions}</div>
            </button>
          );
        })}

        {isLoading && (
          <div className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">Loading directory…</div>
        )}

        {!isLoading && sortedEntries.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">This directory is empty.</div>
        )}
      </div>
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 w-52 py-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.targetName && (
            <>
              {paneId === 'remote' ? (
                <CtxItem label="Download" onClick={() => fireAction('download')} />
              ) : (
                <CtxItem label="Upload" onClick={() => fireAction('upload')} />
              )}
              <div className="my-1 border-t border-[var(--color-border)]" />
            </>
          )}
          <CtxItem label="Copy" disabled={selectedNames.length === 0} onClick={() => fireAction('copy')} />
          <CtxItem label="Paste" disabled={!hasPasteSource} onClick={() => fireAction('paste')} />
          <div className="my-1 border-t border-[var(--color-border)]" />
          <CtxItem label="Rename" disabled={selectedNames.length !== 1} onClick={() => fireAction('rename')} />
          <CtxItem label="Delete" disabled={selectedNames.length === 0} onClick={() => fireAction('delete')} className="text-[var(--color-error)]" />
          <div className="my-1 border-t border-[var(--color-border)]" />
          <CtxItem label="New Folder" onClick={() => fireAction('new-folder')} />
          <div className="my-1 border-t border-[var(--color-border)]" />
          {contextMenu.targetName && (
            <CtxItem label={selectedNames.includes(contextMenu.targetName) ? 'Deselect' : 'Select'} onClick={() => { fireAction('toggle-select'); }} />
          )}
          <CtxItem label="Select All" onClick={() => { onSelectAll?.(); setContextMenu(null); }} />
          {selectedNames.length > 0 && (
            <CtxItem label="Deselect All" onClick={() => { onDeselectAll?.(); setContextMenu(null); }} />
          )}
          {!checkboxMode && (
            <CtxItem label="Checkbox Mode" onClick={() => { onToggleCheckboxMode?.(); setContextMenu(null); }} />
          )}
          {checkboxMode && (
            <CtxItem label="Exit Checkbox Mode" onClick={() => { onToggleCheckboxMode?.(); setContextMenu(null); }} />
          )}
          <div className="my-1 border-t border-[var(--color-border)]" />
          <CtxItem label="Refresh" onClick={() => fireAction('refresh')} />
        </div>
      )}
    </div>
  );
}

function CtxItem({ label, disabled, onClick, className }: { label: string; disabled?: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      className={`w-full px-4 py-1.5 text-sm text-left transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--color-hover)]'} ${className ?? 'text-[var(--color-text-primary)]'}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function buildBreadcrumbs(path: string) {
  const normalizedPath = normalizePath(path);

  if (!normalizedPath || normalizedPath === '.') {
    return [{ label: '~', path: '.' }];
  }

  const separator = normalizedPath.includes('\\') && !normalizedPath.includes('/') ? '\\' : '/';
  const parts = normalizedPath.split(/[\\/]+/).filter(Boolean);
  const breadcrumbs: Array<{ label: string; path: string }> = [];

  if (normalizedPath.startsWith('/')) {
    breadcrumbs.push({ label: '/', path: '/' });
  } else {
    breadcrumbs.push({ label: '~', path: '.' });
  }

  let currentPath = normalizedPath.startsWith('/') ? '' : '';
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}${separator}${part}` : part;
    breadcrumbs.push({
      label: part,
      path: normalizedPath.startsWith('/') ? `/${currentPath}` : currentPath,
    });
  }

  return breadcrumbs;
}

function getParentPath(path: string) {
  const normalizedPath = normalizePath(path);

  if (!normalizedPath || normalizedPath === '.' || normalizedPath === '/') {
    return null;
  }

  if (/^[A-Za-z]:\\?$/.test(normalizedPath)) {
    return null;
  }

  const separator = normalizedPath.includes('\\') && !normalizedPath.includes('/') ? '\\' : '/';
  const parts = normalizedPath.split(/[\\/]+/).filter(Boolean);

  if (parts.length <= 1) {
    return normalizedPath.startsWith('/') ? '/' : '.';
  }

  const parent = parts.slice(0, -1).join(separator);
  return normalizedPath.startsWith('/') ? `/${parent}` : parent;
}

function joinPath(basePath: string, name: string) {
  const normalizedPath = normalizePath(basePath);
  if (!normalizedPath || normalizedPath === '.') {
    return name;
  }

  if (normalizedPath.endsWith('/') || normalizedPath.endsWith('\\')) {
    return `${normalizedPath}${name}`;
  }

  const separator = normalizedPath.includes('\\') && !normalizedPath.includes('/') ? '\\' : '/';
  return `${normalizedPath}${separator}${name}`;
}

function normalizePath(path: string) {
  return path.replace(/\\/g, '\\');
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatModified(value: string) {
  if (value === '—') {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
