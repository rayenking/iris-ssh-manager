import React from 'react';
import hljs from 'highlight.js/lib/common';

export function highlightContent(content: string, filePath: string): React.ReactNode {
  const lang = detectLanguage(filePath);
  const text = content || ' ';

  let highlighted: string;
  try {
    if (lang) {
      highlighted = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
    } else {
      highlighted = hljs.highlightAuto(text).value;
    }
  } catch {
    return text;
  }

  return <span dangerouslySetInnerHTML={{ __html: highlighted }} />;
}

function detectLanguage(filePath: string): string | undefined {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot === -1 ? '' : lower.slice(dot);

  const filenameMap: Record<string, string> = {
    'makefile': 'makefile',
    'dockerfile': 'dockerfile',
    'cmakelists.txt': 'cmake',
    '.gitignore': 'plaintext',
    '.env': 'bash',
    '.env.local': 'bash',
    '.env.production': 'bash',
    '.env.development': 'bash',
    '.bashrc': 'bash',
    '.zshrc': 'bash',
    '.profile': 'bash',
  };

  if (filenameMap[lower]) return filenameMap[lower];

  const extMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.rb': 'ruby',
    '.java': 'java',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.swift': 'swift',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.html': 'xml',
    '.htm': 'xml',
    '.xml': 'xml',
    '.svg': 'xml',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'ini',
    '.ini': 'ini',
    '.cfg': 'ini',
    '.conf': 'nginx',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
    '.fish': 'bash',
    '.ps1': 'powershell',
    '.psm1': 'powershell',
    '.bat': 'dos',
    '.cmd': 'dos',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.sql': 'sql',
    '.graphql': 'graphql',
    '.gql': 'graphql',
    '.lua': 'lua',
    '.r': 'r',
    '.R': 'r',
    '.php': 'php',
    '.pl': 'perl',
    '.pm': 'perl',
    '.ex': 'elixir',
    '.exs': 'elixir',
    '.erl': 'erlang',
    '.hrl': 'erlang',
    '.hs': 'haskell',
    '.scala': 'scala',
    '.clj': 'clojure',
    '.dart': 'dart',
    '.vue': 'xml',
    '.svelte': 'xml',
    '.tf': 'hcl',
    '.hcl': 'hcl',
    '.proto': 'protobuf',
    '.dockerfile': 'dockerfile',
    '.nginx': 'nginx',
    '.diff': 'diff',
    '.patch': 'diff',
    '.zig': 'zig',
    '.nim': 'nim',
    '.v': 'verilog',
    '.sol': 'solidity',
  };

  return extMap[ext] || undefined;
}
