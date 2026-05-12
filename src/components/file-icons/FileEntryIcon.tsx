import { Braces, FileCode2, FileJson2, FileText, FolderArchive, FolderCog, FolderGit2, FolderOpen, FolderRoot } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  name: string;
  isDir: boolean;
  fullPath?: string;
  className?: string;
}

type IconSpec = {
  icon: LucideIcon;
  className: string;
};

const folderByName: Record<string, IconSpec> = {
  src: { icon: FolderRoot, className: 'text-sky-400' },
  public: { icon: FolderOpen, className: 'text-amber-400' },
  dist: { icon: FolderArchive, className: 'text-emerald-400' },
  node_modules: { icon: FolderArchive, className: 'text-lime-400' },
  scripts: { icon: FolderCog, className: 'text-violet-400' },
  '.git': { icon: FolderGit2, className: 'text-orange-400' },
  '.github': { icon: FolderGit2, className: 'text-indigo-400' },
};

const fileByName: Record<string, IconSpec> = {
  'package.json': { icon: FileJson2, className: 'text-emerald-400' },
  'package-lock.json': { icon: FileJson2, className: 'text-emerald-500' },
  'tsconfig.json': { icon: FileJson2, className: 'text-sky-400' },
  'tsconfig.app.json': { icon: FileJson2, className: 'text-sky-400' },
  'tsconfig.node.json': { icon: FileJson2, className: 'text-sky-400' },
  'cargo.toml': { icon: FileCode2, className: 'text-orange-400' },
  'cargo.lock': { icon: FileCode2, className: 'text-orange-500' },
  '.gitignore': { icon: FileText, className: 'text-zinc-400' },
  'readme.md': { icon: FileText, className: 'text-sky-300' },
  'license': { icon: FileText, className: 'text-zinc-300' },
  'vite.config.ts': { icon: Braces, className: 'text-violet-400' },
  'eslint.config.js': { icon: Braces, className: 'text-purple-400' },
  'claude.md': { icon: FileText, className: 'text-cyan-300' },
  'dev.log': { icon: FileText, className: 'text-rose-300' },
};

const fileByExtension: Record<string, IconSpec> = {
  ts: { icon: Braces, className: 'text-sky-400' },
  tsx: { icon: Braces, className: 'text-sky-400' },
  js: { icon: Braces, className: 'text-yellow-300' },
  jsx: { icon: Braces, className: 'text-yellow-300' },
  json: { icon: FileJson2, className: 'text-amber-300' },
  md: { icon: FileText, className: 'text-sky-300' },
  rs: { icon: Braces, className: 'text-orange-400' },
  toml: { icon: FileCode2, className: 'text-orange-300' },
  yml: { icon: FileText, className: 'text-rose-300' },
  yaml: { icon: FileText, className: 'text-rose-300' },
  css: { icon: Braces, className: 'text-blue-400' },
  html: { icon: Braces, className: 'text-orange-300' },
  png: { icon: FileCode2, className: 'text-fuchsia-300' },
  jpg: { icon: FileCode2, className: 'text-fuchsia-300' },
  jpeg: { icon: FileCode2, className: 'text-fuchsia-300' },
  svg: { icon: FileCode2, className: 'text-pink-300' },
  log: { icon: FileText, className: 'text-rose-300' },
};

function cn(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}

function resolveFileIcon(name: string, isDir: boolean): IconSpec {
  const lower = name.toLowerCase();

  if (isDir) {
    return folderByName[lower] ?? { icon: FolderOpen, className: 'text-[var(--color-warning)]' };
  }

  const namedIcon = fileByName[lower];
  if (namedIcon) {
    return namedIcon;
  }

  const dot = lower.lastIndexOf('.');
  const ext = dot === -1 ? '' : lower.slice(dot + 1);
  return fileByExtension[ext] ?? { icon: FileCode2, className: 'text-[var(--color-text-muted)]' };
}

export function FileEntryIcon({ name, isDir, className }: Props) {
  const spec = resolveFileIcon(name, isDir);
  const Icon = spec.icon;
  return <Icon className={cn('h-4 w-4 shrink-0', spec.className, className)} />;
}
