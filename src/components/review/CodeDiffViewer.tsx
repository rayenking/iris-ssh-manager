import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { highlightContent } from '../../lib/syntaxHighlight';

interface Props {
  content: string;
  filePath: string;
}

type DiffLineKind = 'meta' | 'added' | 'removed' | 'context';

type DiffLine = {
  key: string;
  lineNumber: string;
  prefix: string;
  kind: DiffLineKind;
  content: string;
};

function parseHunkHeader(line: string) {
  const match = line.match(/^@@ -([0-9]+)(?:,([0-9]+))? \+([0-9]+)(?:,([0-9]+))? @@/);
  if (!match) {
    return null;
  }

  return {
    oldStart: Number(match[1]),
    newStart: Number(match[3]),
  };
}

function buildDiffLines(content: string) {
  const lines = content.split('\n');
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  lines.forEach((line, index) => {
    if (line.startsWith('@@')) {
      const parsed = parseHunkHeader(line);
      if (parsed) {
        oldLine = parsed.oldStart;
        newLine = parsed.newStart;
      }
      result.push({
        key: `meta-${index}`,
        lineNumber: '',
        prefix: '@@',
        kind: 'meta',
        content: line,
      });
      return;
    }

    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('Binary files')) {
      result.push({
        key: `meta-${index}`,
        lineNumber: '',
        prefix: '',
        kind: 'meta',
        content: line,
      });
      return;
    }

    if (line.startsWith('+')) {
      result.push({
        key: `added-${index}`,
        lineNumber: String(newLine),
        prefix: '+',
        kind: 'added',
        content: line.slice(1),
      });
      newLine += 1;
      return;
    }

    if (line.startsWith('-')) {
      result.push({
        key: `removed-${index}`,
        lineNumber: String(oldLine),
        prefix: '-',
        kind: 'removed',
        content: line.slice(1),
      });
      oldLine += 1;
      return;
    }

    result.push({
      key: `context-${index}`,
      lineNumber: newLine > 0 ? String(newLine) : oldLine > 0 ? String(oldLine) : '',
      prefix: line.startsWith(' ') ? ' ' : '',
      kind: 'context',
      content: line.startsWith(' ') ? line.slice(1) : line,
    });
    oldLine += 1;
    newLine += 1;
  });

  return result;
}

function getLineClass(kind: DiffLineKind) {
  if (kind === 'added') return 'bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[color-mix(in_srgb,var(--color-success)_78%,var(--color-text-primary))]';
  if (kind === 'removed') return 'bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)] text-[color-mix(in_srgb,var(--color-error)_78%,var(--color-text-primary))]';
  if (kind === 'meta') return 'bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[color-mix(in_srgb,var(--color-accent)_82%,var(--color-text-primary))]';
  return 'text-[var(--color-text-primary)]';
}

function getPrefixClass(kind: DiffLineKind) {
  if (kind === 'added') return 'text-[var(--color-success)]';
  if (kind === 'removed') return 'text-[var(--color-error)]';
  if (kind === 'meta') return 'text-[var(--color-accent)]';
  return 'text-[var(--color-text-muted)]';
}

function renderContent(line: DiffLine, filePath: string): ReactNode {
  if (line.kind === 'meta') {
    return line.content || ' ';
  }

  return highlightContent(line.content || ' ', filePath);
}

export function CodeDiffViewer({ content, filePath }: Props) {
  const lines = useMemo(() => buildDiffLines(content), [content]);

  return (
    <div className="h-full min-h-0 overflow-auto bg-[var(--color-bg-primary)] font-mono text-[12px] leading-6">
      <div className="min-w-full">
        {lines.map((line) => (
          <div key={line.key} className={`grid min-w-full grid-cols-[52px_20px_minmax(0,1fr)] ${getLineClass(line.kind)}`}>
            <div className="border-r border-[var(--color-border)] px-2 text-right text-[var(--color-text-muted)] select-none">{line.lineNumber}</div>
            <div className={`px-2 font-semibold select-none ${getPrefixClass(line.kind)}`}>{line.prefix}</div>
            <div className="min-w-0 overflow-x-auto pr-4 whitespace-pre">
              {renderContent(line, filePath)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
