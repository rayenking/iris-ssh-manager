import React from 'react';

const C = {
  comment: '#546e7a', string: '#c3e88d', keyword: '#c792ea', variable: '#f07178',
  number: '#f78c6c', command: '#82aaff', heading: '#ffcb6b', text: '#eeffff',
  codeBg: '#1e272e', link: '#82aaff', operator: '#89ddff',
} as const;

const SHELL_EXTS = new Set(['.sh', '.bash', '.zsh', '.zshrc', '.bashrc', '.profile', '.env']);
const MD_EXTS = new Set(['.md', '.markdown']);
const YAML_EXTS = new Set(['.yml', '.yaml']);
const JSON_EXTS = new Set(['.json']);
const TOML_EXTS = new Set(['.toml']);
const SHELL_KEYWORDS = new Set(['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac', 'function', 'return', 'export', 'local', 'readonly', 'declare', 'source']);
const LITERALS = new Set(['true', 'false', 'null']);

type Lang = 'plain' | 'markdown' | 'shell' | 'yaml' | 'json' | 'toml';
type Token = { text: string; style?: React.CSSProperties };
type InlineNode = string | React.ReactElement;

export function highlightContent(content: string, filePath: string): React.ReactNode {
  const lang = getLanguage(filePath);
  if (lang === 'plain') return content;

  let inFence = false;
  return content.split('\n').map((line, index) => {
    const safe = line || ' ';
    let rendered: React.ReactNode;

    if (lang === 'markdown') {
      const fence = /^\s*```/.test(line);
      if (fence) inFence = !inFence;
      rendered = fence || inFence ? renderTokens([{ text: safe, style: codeStyle() }], index, safe) : renderMarkdownLine(line, index);
    } else if (lang === 'shell') {
      rendered = renderTokens(tokenizeShell(line), index, safe);
    } else if (lang === 'yaml') {
      rendered = renderTokens(tokenizeKeyValueLine(line, /^(\s*-?\s*)([^:#\n][^:\n]*?)(\s*:\s*)(.*)$/), index, safe);
    } else if (lang === 'json') {
      rendered = renderTokens(tokenizeJson(line), index, safe);
    } else {
      rendered = renderTokens(tokenizeToml(line), index, safe);
    }

    return <span key={`line-${index}`} className="block">{rendered}</span>;
  });
}

function renderMarkdownLine(line: string, lineIndex: number) {
  if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
    return renderTokens([{ text: line || ' ', style: color(C.operator) }], lineIndex, line || ' ');
  }

  const heading = line.match(/^(\s*#{1,6}\s+)(.*)$/);
  if (heading) {
    return renderInline([
      span(`h-m-${lineIndex}`, heading[1], { color: C.heading, fontWeight: 700 }),
      ...markdownInline(heading[2], `h-${lineIndex}`, { color: C.heading, fontWeight: 700 }),
    ], lineIndex, line);
  }

  const quote = line.match(/^(\s*>\s?)(.*)$/);
  if (quote) {
    const style = { color: C.comment, fontStyle: 'italic' } as const;
    return renderInline([
      span(`q-m-${lineIndex}`, quote[1], style),
      ...markdownInline(quote[2], `q-${lineIndex}`, style),
    ], lineIndex, line);
  }

  const list = line.match(/^(\s*(?:[-*])\s+)(.*)$/);
  if (list) {
    return renderInline([
      span(`l-m-${lineIndex}`, list[1], color(C.operator)),
      ...markdownInline(list[2], `l-${lineIndex}`),
    ], lineIndex, line);
  }

  return renderInline(markdownInline(line, `m-${lineIndex}`), lineIndex, line);
}

function markdownInline(text: string, key: string, base?: React.CSSProperties): InlineNode[] {
  const nodes: InlineNode[] = [];
  let plain = '';

  const flush = () => {
    if (!plain) return;
    nodes.push(base ? span(`${key}-p-${nodes.length}`, plain, base) : plain);
    plain = '';
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) {
      plain += text.slice(i, i + 2);
      i += 1;
      continue;
    }

    if (ch === '`') {
      const end = findClosing(text, i + 1, '`');
      if (end !== -1) {
        flush();
        nodes.push(span(`${key}-c-${i}`, text.slice(i, end + 1), codeStyle(base)));
        i = end;
        continue;
      }
    }

    if (ch === '[') {
      const textEnd = findClosing(text, i + 1, ']');
      if (textEnd !== -1 && text[textEnd + 1] === '(') {
        const hrefEnd = findClosing(text, textEnd + 2, ')');
        if (hrefEnd !== -1) {
          flush();
          nodes.push(span(`${key}-a-${i}`, text.slice(i, hrefEnd + 1), { ...base, color: C.link, textDecoration: 'underline' }));
          i = hrefEnd;
          continue;
        }
      }
    }

    const strong = text.slice(i, i + 2);
    if (strong === '**' || strong === '__') {
      const end = text.indexOf(strong, i + 2);
      if (end !== -1) {
        flush();
        const style = { ...base, color: C.text, fontWeight: 700 };
        nodes.push(<span key={`${key}-b-${i}`} style={style}>{markdownInline(text.slice(i + 2, end), `${key}-b-${i}`, style)}</span>);
        i = end + 1;
        continue;
      }
    }

    if ((ch === '*' || ch === '_') && text[i + 1] !== ch) {
      const end = text.indexOf(ch, i + 1);
      if (end !== -1) {
        flush();
        const style = { ...base, color: C.text, fontStyle: 'italic' };
        nodes.push(<span key={`${key}-i-${i}`} style={style}>{markdownInline(text.slice(i + 1, end), `${key}-i-${i}`, style)}</span>);
        i = end;
        continue;
      }
    }

    plain += ch;
  }

  flush();
  return nodes.length ? nodes : [base ? span(`${key}-e`, ' ', base) : ' '];
}

function tokenizeShell(line: string): Token[] {
  const tokens: Token[] = [];
  let expectCommand = true;

  for (let i = 0; i < line.length;) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : '';
    const op = matchOperator(line, i, ['&&', '||', '>>', '|', ';', '>', '<', '&']);
    const variable = line.slice(i).match(/^\$\([^)]+\)|^\$\{[^}]+\}|^\$[A-Za-z_][A-Za-z0-9_]*/)?.[0] ?? '';
    const word = line.slice(i).match(/^[A-Za-z0-9_./-]+/)?.[0] ?? '';

    if (ch === '#' && (i === 0 || /\s/.test(prev))) {
      tokens.push({ text: line.slice(i), style: color(C.comment) });
      break;
    }
    if (ch === '"' || ch === "'") {
      const end = findQuotedEnd(line, i, ch);
      tokens.push({ text: line.slice(i, end), style: color(C.string) });
      i = end;
      expectCommand = false;
      continue;
    }
    if (op) {
      tokens.push({ text: op, style: color(C.operator) });
      i += op.length;
      expectCommand = true;
      continue;
    }
    if (variable) {
      tokens.push({ text: variable, style: color(C.variable) });
      i += variable.length;
      expectCommand = false;
      continue;
    }
    if (word) {
      const style = SHELL_KEYWORDS.has(word)
        ? color(C.keyword)
        : /^\d+(?:\.\d+)?$/.test(word)
          ? color(C.number)
          : expectCommand && !word.includes('=')
            ? color(C.command)
            : undefined;
      tokens.push({ text: word, style });
      i += word.length;
      expectCommand = false;
      continue;
    }
    tokens.push({ text: ch });
    i += 1;
  }

  return tokens;
}

function tokenizeKeyValueLine(line: string, keyPattern: RegExp): Token[] {
  const commentAt = findComment(line);
  const body = commentAt === -1 ? line : line.slice(0, commentAt);
  const comment = commentAt === -1 ? '' : line.slice(commentAt);
  const match = body.match(keyPattern);
  const tokens: Token[] = [];

  if (match) {
    tokens.push({ text: match[1] });
    tokens.push({ text: match[2], style: color(C.command) });
    tokens.push({ text: match[3], style: color(C.operator) });
    tokens.push(...tokenizeValue(match[4]));
  } else {
    tokens.push(...tokenizeValue(body));
  }
  if (comment) tokens.push({ text: comment, style: color(C.comment) });
  return tokens;
}

function tokenizeJson(line: string): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < line.length;) {
    if (line[i] === '"') {
      const end = findQuotedEnd(line, i, '"');
      const text = line.slice(i, end);
      let j = end;
      while (j < line.length && /\s/.test(line[j])) j += 1;
      tokens.push({ text, style: color(j < line.length && line[j] === ':' ? C.command : C.string) });
      i = end;
      continue;
    }
    const op = matchOperator(line, i, [':', ',', '{', '}', '[', ']']);
    const word = line.slice(i).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|^[A-Za-z_]+/)?.[0] ?? '';
    if (op) {
      tokens.push({ text: op, style: color(C.operator) });
      i += op.length;
    } else if (word) {
      tokens.push({ text: word, style: LITERALS.has(word) ? color(C.keyword) : /^-?\d/.test(word) ? color(C.number) : undefined });
      i += word.length;
    } else {
      tokens.push({ text: line[i] });
      i += 1;
    }
  }
  return tokens;
}

function tokenizeToml(line: string): Token[] {
  if (/^\s*\[.*\]\s*$/.test(line)) return [{ text: line || ' ', style: { color: C.heading, fontWeight: 700 } }];
  return tokenizeKeyValueLine(line, /^(\s*)([^=\s][^=]*?)(\s*=\s*)(.*)$/);
}

function tokenizeValue(text: string): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < text.length;) {
    if (text[i] === '"' || text[i] === "'") {
      const end = findQuotedEnd(text, i, text[i]);
      tokens.push({ text: text.slice(i, end), style: color(C.string) });
      i = end;
      continue;
    }
    const word = text.slice(i).match(/^-?\d+(?:\.\d+)?|^[A-Za-z_][A-Za-z0-9_-]*/)?.[0] ?? '';
    if (word) {
      tokens.push({ text: word, style: LITERALS.has(word) ? color(C.keyword) : /^-?\d/.test(word) ? color(C.number) : undefined });
      i += word.length;
    } else {
      tokens.push({ text: text[i] });
      i += 1;
    }
  }
  return tokens;
}

function renderTokens(tokens: Token[], lineIndex: number, fallback: string) {
  return tokens.length
    ? tokens.map((token, index) => token.style
      ? <span key={`${lineIndex}-${index}`} style={token.style}>{token.text}</span>
      : <React.Fragment key={`${lineIndex}-${index}`}>{token.text}</React.Fragment>)
    : fallback;
}

function renderInline(nodes: InlineNode[], lineIndex: number, fallback: string) {
  return nodes.length
    ? nodes.map((node, index) => typeof node === 'string'
      ? <React.Fragment key={`${lineIndex}-${index}`}>{node}</React.Fragment>
      : React.cloneElement(node, { key: node.key ?? `${lineIndex}-${index}` }))
    : fallback || ' ';
}

function getLanguage(filePath: string): Lang {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot === -1 ? '' : lower.slice(dot);
  if (MD_EXTS.has(ext)) return 'markdown';
  if (SHELL_EXTS.has(ext) || name === 'Makefile' || name === 'Dockerfile') return 'shell';
  if (YAML_EXTS.has(ext)) return 'yaml';
  if (JSON_EXTS.has(ext)) return 'json';
  if (TOML_EXTS.has(ext)) return 'toml';
  return 'plain';
}

function findQuotedEnd(text: string, start: number, quote: string) {
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] === '\\' && quote === '"' && i + 1 < text.length) {
      i += 1;
      continue;
    }
    if (text[i] === quote) return i + 1;
  }
  return text.length;
}

function findClosing(text: string, start: number, marker: string) {
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (text[i] === marker) return i;
  }
  return -1;
}

function findComment(text: string) {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!quote && (ch === '"' || ch === "'")) quote = ch;
    else if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '#') return i;
  }
  return -1;
}

function matchOperator(text: string, start: number, ops: string[]) {
  return ops.find((op) => text.startsWith(op, start)) ?? '';
}

function color(value: string): React.CSSProperties {
  return { color: value };
}

function codeStyle(base?: React.CSSProperties): React.CSSProperties {
  return { ...base, color: C.string, backgroundColor: C.codeBg, borderRadius: 4, paddingInline: 2 };
}

function span(key: string, text: string, style: React.CSSProperties) {
  return <span key={key} style={style}>{text}</span>;
}
