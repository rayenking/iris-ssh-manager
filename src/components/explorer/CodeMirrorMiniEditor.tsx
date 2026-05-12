import { useCallback, useMemo, useRef } from 'react';
import { highlightContent } from '../../lib/syntaxHighlight';

interface Props {
  value: string;
  filePath: string;
  readOnly: boolean;
  onChange?: (value: string) => void;
}

export function CodeMirrorMiniEditor({ value, filePath, readOnly, onChange }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLPreElement | null>(null);
  const lineNumbers = useMemo(() => {
    const count = Math.max(value.split('\n').length, 1);
    return Array.from({ length: count }, (_, i) => i + 1).join('\n');
  }, [value]);

  const handleScroll = useCallback(() => {
    if (!textareaRef.current) {
      return;
    }

    const { scrollTop, scrollLeft } = textareaRef.current;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  }, []);

  if (readOnly) {
    return (
      <div className="flex h-full min-h-0 overflow-auto font-mono text-[13px] leading-[1.6]">
        <pre className="sticky left-0 select-none border-r border-[#252526] bg-[#161616] px-3 py-3 text-right text-[#5a5a5a]">
          {lineNumbers}
        </pre>
        <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words bg-[#111111] px-3 py-3 text-[#d4d4d4] [&_.hljs-addition]:text-inherit [&_.hljs-attr]:text-[#f07178] [&_.hljs-attribute]:text-[#f07178] [&_.hljs-built_in]:text-[#ffcb6b] [&_.hljs-bullet]:text-[#f78c6c] [&_.hljs-comment]:text-[#5c6370] [&_.hljs-doctag]:text-[#c792ea] [&_.hljs-formula]:text-[#c792ea] [&_.hljs-keyword]:text-[#c792ea] [&_.hljs-link]:text-[#82aaff] [&_.hljs-literal]:text-[#f78c6c] [&_.hljs-meta]:text-[#89ddff] [&_.hljs-meta_.hljs-keyword]:text-[#89ddff] [&_.hljs-name]:text-[#82aaff] [&_.hljs-number]:text-[#f78c6c] [&_.hljs-operator]:text-[#89ddff] [&_.hljs-params]:text-[#d4d4d4] [&_.hljs-property]:text-[#d4d4d4] [&_.hljs-punctuation]:text-[#89ddff] [&_.hljs-quote]:text-[#5c6370] [&_.hljs-regexp]:text-[#f07178] [&_.hljs-section]:text-[#82aaff] [&_.hljs-string]:text-[#c3e88d] [&_.hljs-subst]:text-[#d4d4d4] [&_.hljs-symbol]:text-[#f78c6c] [&_.hljs-tag]:text-[#89ddff] [&_.hljs-title]:text-[#82aaff] [&_.hljs-type]:text-[#ffcb6b] [&_.hljs-variable]:text-[#f07178]">
          {highlightContent(value || ' ', filePath)}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden font-mono text-[13px] leading-[1.6]">
      <pre ref={gutterRef} className="select-none overflow-hidden border-r border-[#252526] bg-[#161616] px-3 py-3 text-right text-[#5a5a5a]">
        {lineNumbers}
      </pre>
      <div className="relative h-full min-w-0 flex-1 overflow-hidden bg-[#111111]">
        <pre
          ref={highlightRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-3 text-[#d4d4d4] [&_.hljs-addition]:text-inherit [&_.hljs-attr]:text-[#f07178] [&_.hljs-attribute]:text-[#f07178] [&_.hljs-built_in]:text-[#ffcb6b] [&_.hljs-bullet]:text-[#f78c6c] [&_.hljs-comment]:text-[#5c6370] [&_.hljs-doctag]:text-[#c792ea] [&_.hljs-formula]:text-[#c792ea] [&_.hljs-keyword]:text-[#c792ea] [&_.hljs-link]:text-[#82aaff] [&_.hljs-literal]:text-[#f78c6c] [&_.hljs-meta]:text-[#89ddff] [&_.hljs-meta_.hljs-keyword]:text-[#89ddff] [&_.hljs-name]:text-[#82aaff] [&_.hljs-number]:text-[#f78c6c] [&_.hljs-operator]:text-[#89ddff] [&_.hljs-params]:text-[#d4d4d4] [&_.hljs-property]:text-[#d4d4d4] [&_.hljs-punctuation]:text-[#89ddff] [&_.hljs-quote]:text-[#5c6370] [&_.hljs-regexp]:text-[#f07178] [&_.hljs-section]:text-[#82aaff] [&_.hljs-string]:text-[#c3e88d] [&_.hljs-subst]:text-[#d4d4d4] [&_.hljs-symbol]:text-[#f78c6c] [&_.hljs-tag]:text-[#89ddff] [&_.hljs-title]:text-[#82aaff] [&_.hljs-type]:text-[#ffcb6b] [&_.hljs-variable]:text-[#f07178]"
        >
          {highlightContent(value || ' ', filePath)}
        </pre>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          onScroll={handleScroll}
          spellCheck={false}
          className="relative h-full w-full resize-none overflow-auto bg-transparent px-3 py-3 text-transparent outline-none caret-[#aeafad] selection:bg-[#264f78]/45"
        />
      </div>
    </div>
  );
}
