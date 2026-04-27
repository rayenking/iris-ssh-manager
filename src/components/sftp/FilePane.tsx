import { ArrowLeft, ArrowRight, ArrowUp, ChevronRight, File as FileIcon, Folder } from 'lucide-react';
import { useMemo } from 'react';
import type { MouseEvent } from 'react';
import type { FileEntry } from '../../types/sftp';

type SortField = 'name' | 'size' | 'modified';
type SortDirection = 'asc' | 'desc';

interface Props {
  title: string;
  path: string;
  entries: FileEntry[];
  selectedNames: string[];
  sortField: SortField;
  sortDirection: SortDirection;
  isLoading: boolean;
  history?: string[];
  historyIndex?: number;
  onNavigate: (path: string) => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onSelect: (name: string, event: MouseEvent<HTMLButtonElement>) => void;
  onSort: (field: SortField) => void;
}

export function FilePane({
  title,
  path,
  entries,
  selectedNames,
  sortField,
  sortDirection,
  isLoading,
  history = [],
  historyIndex = 0,
  onNavigate,
  onGoBack,
  onGoForward,
  onSelect,
  onSort,
}: Props) {
  const sortedEntries = useMemo(() => {
    const nextEntries = [...entries];
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
  }, [entries, sortDirection, sortField]);

  const breadcrumbs = useMemo(() => buildBreadcrumbs(path), [path]);
  const parentPath = getParentPath(path);
  const canGoBack = onGoBack && historyIndex > 0;
  const canGoForward = onGoForward && historyIndex < history.length - 1;

  return (
    <div className="flex h-full min-h-0 flex-col border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <div className="shrink-0 border-b border-[var(--color-border)] px-3 py-2">
        <div className="mb-2 flex items-center gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{title}</span>
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
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-sm text-[var(--color-text-secondary)] min-w-0">
          {breadcrumbs.map((segment, index) => (
            <div key={`${segment.path}-${index}`} className="flex items-center gap-1 min-w-0">
              {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />}
              <button
                className="truncate rounded px-1.5 py-0.5 hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
                onClick={() => onNavigate(segment.path)}
                type="button"
              >
                {segment.label}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 grid grid-cols-[minmax(0,1fr)_80px_140px_80px] gap-2 border-b border-[var(--color-border)] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
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

      <div className="flex-1 min-h-0 overflow-y-auto">
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
              className={`grid w-full grid-cols-[minmax(0,1fr)_80px_140px_80px] gap-2 border-b border-[var(--color-border)] px-3 py-2 text-left text-sm transition-colors ${
                isSelected ? 'bg-[var(--color-hover)] text-[var(--color-text-primary)]' : 'hover:bg-[var(--color-bg-tertiary)]'
              }`}
              onClick={(event) => onSelect(entry.name, event)}
              onDoubleClick={() => {
                if (entry.isDir) {
                  onNavigate(joinPath(path, entry.name));
                }
              }}
              type="button"
            >
              <div className="flex min-w-0 items-center gap-2">
                {entry.isDir ? (
                  <Folder className="h-4 w-4 shrink-0 text-[var(--color-warning)]" />
                ) : (
                  <FileIcon className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
                )}
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
    </div>
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
