'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { Link, Code, List, ListOrdered } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

// Wrap bare text (no block-level tags) in <p> tags
const ensureParagraphs = (html: string): string => {
  if (!html || !html.trim()) return '';
  // If content already has block-level elements, return as-is
  if (/<(p|ul|ol|li|div|h[1-6]|blockquote)[\s>]/i.test(html)) return html;
  // Wrap bare text in <p>
  return `<p>${html}</p>`;
};

// Resolve the anchor the caret/selection is actually in. Walking up only from
// anchorNode.parentElement misses the common cases: the node is the editor
// itself, the caret sits on an anchor boundary, the anchor is nested inside
// <strong>/<li>, or the selection spans (rather than sits inside) the anchor.
const closestAnchor = (node: Node | null | undefined): HTMLAnchorElement | null => {
  if (!node) return null;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  return el?.closest?.('a') ?? null;
};

const findAnchorInSelection = (): HTMLAnchorElement | null => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const direct = closestAnchor(sel.anchorNode) || closestAnchor(sel.focusNode);
  if (direct) return direct;

  const range = sel.getRangeAt(0);
  const ancestor = closestAnchor(range.commonAncestorContainer);
  if (ancestor) return ancestor;

  // Selection spans an anchor rather than sitting inside one
  const container = range.commonAncestorContainer;
  const scope = container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element);
  for (const a of Array.from(scope?.querySelectorAll('a') ?? [])) {
    if (range.intersectsNode(a)) return a as HTMLAnchorElement;
  }
  return null;
};

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, className }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const savedSelection = useRef<Range | null>(null);
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkBlank, setLinkBlank] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [codeView, setCodeView] = useState(false);
  const codeRef = useRef<HTMLTextAreaElement>(null);

  // Set default paragraph separator to <p>
  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  }, []);

  // Sync DOM only when value changes externally
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const wrapped = ensureParagraphs(value);
    if (editorRef.current && editorRef.current.innerHTML !== wrapped) {
      editorRef.current.innerHTML = wrapped;
    }
  }, [value]);

  // Sync code view textarea when switching and auto-size
  useEffect(() => {
    if (codeView && codeRef.current) {
      codeRef.current.value = value;
      codeRef.current.style.height = 'auto';
      codeRef.current.style.height = codeRef.current.scrollHeight + 'px';
    }
  }, [codeView, value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const exec = useCallback((command: string) => {
    document.execCommand(command, false);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && savedSelection.current) {
      sel.removeAllRanges();
      sel.addRange(savedSelection.current);
    }
  }, []);

  const openLinkPopover = useCallback(() => {
    saveSelection();
    const anchor = findAnchorInSelection();
    if (anchor) {
      setLinkUrl(anchor.getAttribute('href') || '');
      setLinkBlank(anchor.getAttribute('target') === '_blank');
    } else {
      setLinkUrl('');
      setLinkBlank(false);
    }
    setLinkError('');
    setShowLinkPopover(true);
  }, [saveSelection]);

  const insertLink = useCallback(() => {
    restoreSelection();
    // An empty URL is never an implicit unlink: silently dropping an existing
    // anchor here destroyed links the editor could not even see. Removing a
    // link stays exclusively on the explicit Remove button.
    if (!linkUrl) {
      setLinkError('Enter a URL, or use Remove to delete the link.');
      return;
    }
    document.execCommand('createLink', false, linkUrl);
    const anchor = findAnchorInSelection();
    if (anchor) {
      if (linkBlank) {
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
      } else {
        anchor.removeAttribute('target');
        anchor.removeAttribute('rel');
      }
    }
    setLinkError('');
    setShowLinkPopover(false);
    editorRef.current?.focus();
    handleInput();
  }, [linkUrl, linkBlank, restoreSelection, handleInput]);

  const removeLink = useCallback(() => {
    restoreSelection();
    document.execCommand('unlink', false);
    setLinkError('');
    setShowLinkPopover(false);
    editorRef.current?.focus();
    handleInput();
  }, [restoreSelection, handleInput]);

  const toggleCodeView = useCallback(() => {
    if (codeView) {
      // Switching from code → visual: apply textarea content
      if (codeRef.current) {
        const html = codeRef.current.value;
        isInternalChange.current = true;
        onChange(html);
        if (editorRef.current) {
          editorRef.current.innerHTML = ensureParagraphs(html);
        }
      }
    }
    setCodeView(!codeView);
  }, [codeView, onChange]);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    isInternalChange.current = true;
    onChange(e.target.value);
  }, [onChange]);

  const btnClass = "w-7 h-7 flex items-center justify-center rounded text-xs text-slate-600 hover:bg-slate-200 transition-colors";

  return (
    <div className={className}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border border-b-0 border-slate-200 rounded-t-lg bg-slate-50 px-1.5 py-1">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} className={`${btnClass} font-bold`} title="Bold">B</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} className={`${btnClass} italic`} title="Italic">I</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')} className={`${btnClass} underline`} title="Underline">U</button>
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')} className={btnClass} title="Bullet List">
          <List className="w-3.5 h-3.5" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')} className={btnClass} title="Numbered List">
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={openLinkPopover} className={btnClass} title="Insert Link">
          <Link className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={toggleCodeView}
          className={`${btnClass} ${codeView ? 'bg-slate-200 text-cyan-600' : ''}`}
          title="Toggle HTML Code View"
        >
          <Code className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Link popover */}
      {showLinkPopover && (
        <div className="border border-t-0 border-slate-200 bg-white px-3 py-2 space-y-2">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => { setLinkUrl(e.target.value); if (linkError) setLinkError(''); }}
            placeholder="https://..."
            className="w-full text-xs"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertLink(); } }}
          />
          {linkError && <p className="text-[11px] text-red-500">{linkError}</p>}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={linkBlank}
                onChange={(e) => setLinkBlank(e.target.checked)}
                className="rounded border-slate-300 text-cyan-500 focus:ring-cyan-500/40 w-3.5 h-3.5"
              />
              Open in new tab
            </label>
            <div className="flex items-center gap-1.5">
              {linkUrl && (
                <button type="button" onClick={removeLink} className="text-[11px] text-red-500 hover:underline">Remove</button>
              )}
              <button type="button" onClick={() => setShowLinkPopover(false)} className="text-[11px] text-slate-400 hover:underline">Cancel</button>
              <button type="button" onClick={insertLink} className="text-[11px] text-cyan-600 font-medium hover:underline">Apply</button>
            </div>
          </div>
        </div>
      )}
      {/* Code view (textarea) */}
      {codeView && (
        <textarea
          ref={codeRef}
          defaultValue={value}
          onChange={(e) => { handleCodeChange(e); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
          onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
          className="w-full min-h-[5rem] border border-slate-200 rounded-b-lg px-3 py-2 text-xs font-mono text-slate-700 bg-slate-50 resize-y focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500"
          style={{ fieldSizing: 'content' } as React.CSSProperties}
          spellCheck={false}
        />
      )}
      {/* Visual editor */}
      <div
        ref={editorRef}
        contentEditable={!codeView}
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        className={`w-full min-h-[5rem] border border-slate-200 px-3 py-2 text-sm text-slate-800 break-words overflow-hidden focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_a]:text-cyan-600 [&_a]:underline [&_a]:decoration-cyan-600/40 [&_a]:underline-offset-2 ${codeView ? 'hidden' : 'rounded-b-lg'}`}
        style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
      />
    </div>
  );
};
