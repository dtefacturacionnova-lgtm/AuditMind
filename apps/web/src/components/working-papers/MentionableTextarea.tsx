'use client';

/**
 * MentionableTextarea
 * ─────────────────────────────────────────────────────────────────────────────
 * Textarea / text-input with @mention autocomplete for audit paper references.
 *
 * Behaviour:
 *  - User types `@` to trigger the dropdown.
 *  - Dropdown shows every paper in the audit (code + title).
 *  - Clicking a paper inserts `@[A-02]`; clicking a section inserts `@[A-02::S3]`.
 *  - On selection, an optional callback fires so the parent can persist
 *    the PaperReference record via `useCreateReference()`.
 *
 * The stored text value contains the literal tokens (@[code] / @[code::key]).
 * The display layer renders them highlighted via `HighlightedText` (sibling).
 */

import {
  useRef, useState, useEffect, useCallback,
  type KeyboardEvent, type ChangeEvent,
} from 'react';
import { Hash, FileText, ChevronRight } from 'lucide-react';
import type { MentionItem } from '@/hooks/useWorkingPaperGraph';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MentionableTextareaProps {
  value:       string;
  onChange:    (v: string) => void;
  onBlur?:     () => void;
  multiline?:  boolean;
  rows?:       number;
  placeholder?: string;
  className?:  string;
  // Mention support
  auditId?:   string;
  paperId?:   string;
  sectionKey?: string;
  mentionItems?: MentionItem[];     // pre-fetched from useMentionIndex()
  onMentionSelect?: (
    targetPaperId: string,
    targetSectionKey?: string,
  ) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the @-trigger prefix before the cursor position, or null if none. */
function getMentionQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor);
  const atIdx   = before.lastIndexOf('@');
  if (atIdx === -1) return null;
  // Make sure there's no whitespace between '@' and cursor
  const fragment = before.slice(atIdx + 1);
  if (/\s/.test(fragment)) return null;
  return fragment.toLowerCase();
}

// ─── MentionDropdown ─────────────────────────────────────────────────────────

interface DropdownProps {
  items:       MentionItem[];
  query:       string;
  onSelect:    (paperId: string, code: string, sectionKey?: string, sectionLabel?: string) => void;
  onClose:     () => void;
}

function MentionDropdown({ items, query, onSelect, onClose }: DropdownProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filter by query
  const filtered = items.filter(p =>
    p.code.toLowerCase().includes(query) ||
    p.title.toLowerCase().includes(query),
  ).slice(0, 8);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest('[data-mention-dropdown]')) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!filtered.length) return null;

  return (
    <div
      data-mention-dropdown
      className="absolute z-50 mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
      style={{ top: '100%', left: 0 }}
    >
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
          Papeles de trabajo — @mención
        </p>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filtered.map(paper => (
          <div key={paper.paperId}>
            {/* Paper row */}
            <div className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer group">
              <button
                type="button"
                onClick={() => onSelect(paper.paperId, paper.code)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <span className="text-xs font-mono font-semibold text-blue-600 shrink-0">
                  {paper.code}
                </span>
                <span className="text-xs text-gray-700 truncate">{paper.title}</span>
              </button>
              {paper.sections.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === paper.paperId ? null : paper.paperId)}
                  className="p-0.5 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600"
                  title="Ver secciones"
                >
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${
                      expanded === paper.paperId ? 'rotate-90' : ''
                    }`}
                  />
                </button>
              )}
            </div>

            {/* Sections sub-list */}
            {expanded === paper.paperId && paper.sections.map(s => (
              <button
                key={s.sectionKey}
                type="button"
                onClick={() => onSelect(paper.paperId, paper.code, s.sectionKey, s.label)}
                className="w-full flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-indigo-50 text-left"
              >
                <Hash className="w-3 h-3 text-indigo-400 shrink-0" />
                <span className="text-xs font-mono text-indigo-500 shrink-0">{s.sectionKey}</span>
                <span className="text-xs text-gray-500 truncate">{s.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50">
        <p className="text-[10px] text-gray-400">
          Clic en <FileText className="inline w-3 h-3" /> para insertar papel ·{' '}
          <ChevronRight className="inline w-3 h-3" /> para ver secciones
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MentionableTextarea({
  value,
  onChange,
  onBlur,
  multiline = true,
  rows = 4,
  placeholder,
  className = '',
  mentionItems = [],
  onMentionSelect,
}: MentionableTextareaProps) {
  const inputRef  = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const [showDropdown, setShow]   = useState(false);
  const [mentionQuery, setQuery]  = useState('');

  const baseClass =
    'w-full text-sm border border-blue-300 rounded-lg px-3 py-2 focus:outline-none ' +
    'focus:ring-2 focus:ring-blue-500 bg-white ' + className;

  // Detect @ trigger on input change
  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const next   = e.target.value;
    const cursor = e.target.selectionStart ?? next.length;
    const query  = getMentionQuery(next, cursor);

    onChange(next);

    if (query !== null && mentionItems.length > 0) {
      setQuery(query);
      setShow(true);
    } else {
      setShow(false);
    }
  }, [onChange, mentionItems]);

  // Insert mention token at cursor
  const insertMention = useCallback(
    (paperId: string, code: string, sectionKey?: string, _sectionLabel?: string) => {
      const token = sectionKey ? `@[${code}::${sectionKey}]` : `@[${code}]`;
      const el    = inputRef.current;
      if (!el) return;

      const cursor  = el.selectionStart ?? value.length;
      const before  = value.slice(0, cursor);
      const atIdx   = before.lastIndexOf('@');
      const newText = value.slice(0, atIdx) + token + ' ' + value.slice(cursor);

      onChange(newText);
      setShow(false);
      onMentionSelect?.(paperId, sectionKey);

      // Restore focus
      setTimeout(() => {
        el.focus();
        const newCursor = atIdx + token.length + 1;
        el.setSelectionRange(newCursor, newCursor);
      }, 0);
    },
    [value, onChange, onMentionSelect],
  );

  // Keyboard: Escape closes dropdown
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && showDropdown) {
      setShow(false);
      e.preventDefault();
    }
  }

  const sharedProps = {
    ref:         inputRef as React.RefObject<HTMLTextAreaElement>,
    value,
    onChange:    handleChange,
    onBlur,
    onKeyDown:   handleKeyDown,
    placeholder: placeholder ?? (mentionItems.length ? 'Escribe @ para referenciar un papel…' : undefined),
    className:   baseClass,
  };

  return (
    <div ref={wrapRef} className="relative">
      {multiline ? (
        <textarea {...sharedProps} rows={rows} style={{ resize: 'vertical' }} />
      ) : (
        <input
          {...(sharedProps as React.InputHTMLAttributes<HTMLInputElement>)}
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
        />
      )}

      {showDropdown && (
        <MentionDropdown
          items={mentionItems}
          query={mentionQuery}
          onSelect={insertMention}
          onClose={() => setShow(false)}
        />
      )}
    </div>
  );
}

// ─── HighlightedMentions — display component ──────────────────────────────────

/**
 * Renders a text string with @[CODE] / @[CODE::SKEY] tokens highlighted as
 * blue chips. Used in read-only display mode.
 */
export function HighlightedMentions({ text }: { text: string }) {
  const parts = text.split(/(@\[[^\]]+\])/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith('@[') ? (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0 rounded font-mono text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 mx-0.5"
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
