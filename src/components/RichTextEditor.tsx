'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { Link } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, className }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const savedSelection = useRef<Range | null>(null);
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkBlank, setLinkBlank] = useState(false);

  // Sync DOM only when value changes externally
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

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
    // Check if cursor is inside an existing <a>
    const sel = window.getSelection();
    const anchor = sel?.anchorNode?.parentElement?.closest('a');
    if (anchor) {
      setLinkUrl(anchor.getAttribute('href') || '');
      setLinkBlank(anchor.getAttribute('target') === '_blank');
    } else {
      setLinkUrl('');
      setLinkBlank(false);
    }
    setShowLinkPopover(true);
  }, [saveSelection]);

  const insertLink = useCallback(() => {
    restoreSelection();
    if (!linkUrl) {
      document.execCommand('unlink', false);
    } else {
      document.execCommand('createLink', false, linkUrl);
      // Set target if needed
      if (linkBlank) {
        const sel = window.getSelection();
        const anchor = sel?.anchorNode?.parentElement?.closest('a') ||
          sel?.focusNode?.parentElement?.closest('a');
        if (anchor) {
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
        }
      }
    }
    setShowLinkPopover(false);
    editorRef.current?.focus();
    handleInput();
  }, [linkUrl, linkBlank, restoreSelection, handleInput]);

  const removeLink = useCallback(() => {
    restoreSelection();
    document.execCommand('unlink', false);
    setShowLinkPopover(false);
    editorRef.current?.focus();
    handleInput();
  }, [restoreSelection, handleInput]);

  return (
    <div className={className}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border border-b-0 border-slate-200 rounded-t-lg bg-slate-50 px-1.5 py-1">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('bold')}
          className="w-7 h-7 flex items-center justify-center rounded text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('italic')}
          className="w-7 h-7 flex items-center justify-center rounded text-xs italic text-slate-600 hover:bg-slate-200 transition-colors"
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('underline')}
          className="w-7 h-7 flex items-center justify-center rounded text-xs underline text-slate-600 hover:bg-slate-200 transition-colors"
          title="Underline"
        >
          U
        </button>
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openLinkPopover}
          className="w-7 h-7 flex items-center justify-center rounded text-slate-600 hover:bg-slate-200 transition-colors"
          title="Insert Link"
        >
          <Link className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Link popover */}
      {showLinkPopover && (
        <div className="border border-t-0 border-slate-200 bg-white px-3 py-2 space-y-2">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="w-full text-xs"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertLink(); } }}
          />
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
                <button
                  type="button"
                  onClick={removeLink}
                  className="text-[11px] text-red-500 hover:underline"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowLinkPopover(false)}
                className="text-[11px] text-slate-400 hover:underline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={insertLink}
                className="text-[11px] text-cyan-600 font-medium hover:underline"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="w-full min-h-[5rem] border border-slate-200 rounded-b-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400"
      />
    </div>
  );
};
