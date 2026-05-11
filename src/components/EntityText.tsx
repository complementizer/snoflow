import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { LinkedEntity, NOT_LINKED, NONE_MATCH, getCertaintyLevel, getCertaintyLabel, ExplanationVerdict } from '../types';
import { Check, Ban, Plus, HelpCircle } from 'lucide-react';

interface EntityTextProps {
  text: string;
  entities: LinkedEntity[];
  annotations: Record<string, string>;
  confirmed: Set<string>;
  activeEntityKey: string | null;
  onEntityClick: (key: string) => void;
  certaintyMap: Record<string, ExplanationVerdict>;
  onEntityCreate: (start: number, end: number) => void;
  onEntityDelete: (key: string) => void;
  onEntityResize: (key: string, newStart: number, newEnd: number) => void;
}

function getEntityKey(entity: LinkedEntity) {
  return `${entity.start}_${entity.end}_${entity.mention}`;
}

function getCertaintyStyles(verdict: ExplanationVerdict | undefined): string {
  const level = getCertaintyLevel(verdict);
  switch (level) {
    case 'unknown':
      return 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200';
    case 'no_match':
      return 'bg-violet-100 border-violet-400 text-violet-800 hover:bg-violet-200';
    case 'low':
      return 'bg-rose-100 border-rose-400 text-rose-800 hover:bg-rose-200';
    case 'medium':
      return 'bg-amber-100 border-amber-400 text-amber-800 hover:bg-amber-200';
    case 'high':
      return 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100';
  }
}

function getEntityStyles(isReviewed: boolean, isActive: boolean, isNoneMatch: boolean, verdict: ExplanationVerdict | undefined, hasCandidates: boolean): string {
  if (isActive) return 'bg-blue-100 border-blue-500 text-blue-900 ring-2 ring-blue-300';
  if (isNoneMatch) return 'bg-violet-100 border-violet-400 text-violet-800 hover:bg-violet-200 border-dashed';
  if (isReviewed) return 'bg-emerald-50 border-emerald-300 text-emerald-800';
  if (!hasCandidates) return 'bg-slate-100 border-slate-400 text-slate-700 hover:bg-slate-200 border-dashed';
  return getCertaintyStyles(verdict);
}

function getBadgeColor(verdict: ExplanationVerdict | undefined): string {
  const level = getCertaintyLevel(verdict);
  switch (level) {
    case 'unknown': return 'text-slate-400';
    case 'no_match': return 'text-violet-600';
    case 'low': return 'text-rose-600';
    case 'medium': return 'text-amber-600';
    case 'high': return 'text-emerald-600';
  }
}

export function EntityText({
  text,
  entities,
  annotations,
  confirmed,
  activeEntityKey,
  onEntityClick,
  certaintyMap,
  onEntityCreate,
  onEntityResize,
}: EntityTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<{ start: number; end: number; left: number; top: number } | null>(null);
  const [resize, setResize] = useState<{ key: string; edge: 'start' | 'end' } | null>(null);

  const segments = useMemo(() => {
    const out: Array<{ type: 'text' | 'entity'; start: number; end: number; content: string; entity?: LinkedEntity }> = [];
    const sorted = [...entities].sort((a, b) => a.start - b.start);
    let lastEnd = 0;
    for (const entity of sorted) {
      // Skip entities that overlap with previous ones
      if (entity.start < lastEnd) continue;
      if (entity.start > lastEnd) {
        out.push({ type: 'text', start: lastEnd, end: entity.start, content: text.slice(lastEnd, entity.start) });
      }
      // Use the actual text slice for display to ensure consistency with positions
      out.push({ type: 'entity', start: entity.start, end: entity.end, content: text.slice(entity.start, entity.end), entity });
      lastEnd = entity.end;
    }
    if (lastEnd < text.length) {
      out.push({ type: 'text', start: lastEnd, end: text.length, content: text.slice(lastEnd) });
    }
    return out;
  }, [text, entities]);

  // Map a DOM node + offset (from a Selection) to a character offset in `text`.
  // Returns null if the node is inside an entity (we don't allow new entity creation
  // overlapping an existing one).
  const absOffset = useCallback((node: Node, offset: number): number | null => {
    let cur: Node | null = node;
    while (cur && cur !== containerRef.current) {
      if (cur.nodeType === Node.ELEMENT_NODE) {
        const el = cur as HTMLElement;
        const segStart = el.dataset.segStart;
        const segType = el.dataset.segType;
        if (segStart !== undefined) {
          if (segType === 'text') return parseInt(segStart, 10) + offset;
          if (segType === 'entity') return null;
        }
      }
      cur = cur.parentNode;
    }
    return null;
  }, []);

  // Map a viewport (x, y) point to the nearest character offset in `text`. Used for
  // live resize tracking. Falls back to a bbox scan if caretPositionFromPoint returns
  // something outside any segment.
  const pointToOffset = useCallback((x: number, y: number): number | null => {
    type Caret = { node: Node; offset: number };
    let pos: Caret | null = null;
    const docAny = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    if (docAny.caretPositionFromPoint) {
      const p = docAny.caretPositionFromPoint(x, y);
      if (p) pos = { node: p.offsetNode, offset: p.offset };
    } else if (docAny.caretRangeFromPoint) {
      const r = docAny.caretRangeFromPoint(x, y);
      if (r) pos = { node: r.startContainer, offset: r.startOffset };
    }

    const container = containerRef.current;
    if (!container) return null;

    if (pos) {
      let cur: Node | null = pos.node;
      while (cur && cur !== container) {
        if (cur.nodeType === Node.ELEMENT_NODE) {
          const el = cur as HTMLElement;
          const segStart = el.dataset.segStart;
          const segType = el.dataset.segType;
          if (segStart !== undefined) {
            const sStart = parseInt(segStart, 10);
            const sEnd = parseInt(el.dataset.segEnd!, 10);
            if (segType === 'text' && pos.node.nodeType === Node.TEXT_NODE) {
              return sStart + pos.offset;
            }
            const rect = el.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (x - rect.left) / Math.max(1, rect.width)));
            return sStart + Math.round(ratio * (sEnd - sStart));
          }
        }
        cur = cur.parentNode;
      }
    }

    // Fallback: search all segments by bbox; pick the one on this line (if any)
    // closest in x, and interpolate.
    const segs = container.querySelectorAll<HTMLElement>('[data-seg-start]');
    let best: { dist: number; offset: number } | null = null;
    for (const s of Array.from(segs)) {
      const rect = s.getBoundingClientRect();
      const sStart = parseInt(s.dataset.segStart!, 10);
      const sEnd = parseInt(s.dataset.segEnd!, 10);
      if (y >= rect.top && y <= rect.bottom) {
        if (x >= rect.left && x <= rect.right) {
          const ratio = (x - rect.left) / Math.max(1, rect.width);
          return sStart + Math.round(ratio * (sEnd - sStart));
        }
        const dist = x < rect.left ? rect.left - x : x - rect.right;
        const off = x < rect.left ? sStart : sEnd;
        if (!best || dist < best.dist) best = { dist, offset: off };
      }
    }
    return best?.offset ?? null;
  }, []);

  const handleMouseUp = useCallback(() => {
    if (resize) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPending(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!containerRef.current?.contains(range.commonAncestorContainer)) {
      setPending(null);
      return;
    }
    const a = absOffset(range.startContainer, range.startOffset);
    const b = absOffset(range.endContainer, range.endOffset);
    if (a == null || b == null) {
      setPending(null);
      return;
    }
    let s = Math.min(a, b);
    let e = Math.max(a, b);
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (s >= e) {
      setPending(null);
      return;
    }
    for (const ent of entities) {
      if (s < ent.end && e > ent.start) {
        setPending(null);
        return;
      }
    }
    const rect = range.getBoundingClientRect();
    setPending({ start: s, end: e, left: rect.left + rect.width / 2, top: rect.top });
  }, [absOffset, entities, text, resize]);

  // Live resize: track mouse globally while a handle is being dragged.
  useEffect(() => {
    if (!resize) return;
    const onMove = (e: MouseEvent) => {
      const off = pointToOffset(e.clientX, e.clientY);
      if (off == null) return;
      const entity = entities.find(en => getEntityKey(en) === resize.key);
      if (!entity) return;
      let s = entity.start;
      let ee = entity.end;
      if (resize.edge === 'start') {
        s = Math.max(0, Math.min(off, entity.end - 1));
        const prev = entities
          .filter(en => en !== entity && en.end <= entity.start)
          .reduce((best: LinkedEntity | null, en) => (!best || en.end > best.end ? en : best), null);
        if (prev) s = Math.max(s, prev.end);
      } else {
        ee = Math.max(entity.start + 1, Math.min(off, text.length));
        const next = entities
          .filter(en => en !== entity && en.start >= entity.end)
          .reduce((best: LinkedEntity | null, en) => (!best || en.start < best.start ? en : best), null);
        if (next) ee = Math.min(ee, next.start);
      }
      if (s !== entity.start || ee !== entity.end) {
        onEntityResize(resize.key, s, ee);
        const newKey = `${s}_${ee}_${text.slice(s, ee)}`;
        setResize({ key: newKey, edge: resize.edge });
      }
    };
    const onUp = () => setResize(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resize, entities, text, onEntityResize, pointToOffset]);

  const handleResizeStart = (key: string, edge: 'start' | 'end') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPending(null);
    window.getSelection()?.removeAllRanges();
    setResize({ key, edge });
  };

  const handleCreateClick = () => {
    if (!pending) return;
    onEntityCreate(pending.start, pending.end);
    setPending(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <>
      <div
        ref={containerRef}
        className="text-lg leading-loose p-6 bg-white rounded-xl border border-slate-200 shadow-sm select-text"
        onMouseUp={handleMouseUp}
        onMouseDown={() => setPending(null)}
      >
        {segments.map((segment, i) => {
          if (segment.type === 'text') {
            return (
              <span
                key={i}
                data-seg-start={segment.start}
                data-seg-end={segment.end}
                data-seg-type="text"
                className="whitespace-pre-wrap"
              >
                {segment.content}
              </span>
            );
          }

          const entity = segment.entity!;
          const key = getEntityKey(entity);
          const isActive = activeEntityKey === key;
          const annotation = annotations[key];
          const isReviewed = confirmed.has(key);
          const isNotLinked = annotation === NOT_LINKED;
          const isNoneMatch = annotation === NONE_MATCH;

          const wrapperClass = 'relative inline-block group';
          const handleClass =
            'absolute top-0 bottom-0 w-1.5 cursor-ew-resize bg-blue-500 rounded-sm opacity-0 group-hover:opacity-60 hover:!opacity-100';
          const showAffordances = isActive;

          if (isNotLinked) {
            return (
              <span key={i} className={wrapperClass}>
                <button
                  data-seg-start={segment.start}
                  data-seg-end={segment.end}
                  data-seg-type="entity"
                  onClick={() => onEntityClick(isActive ? '' : key)}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-base font-medium transition-all ${
                    isActive
                      ? 'bg-blue-100 border-blue-500 text-blue-900 ring-2 ring-blue-300'
                      : 'bg-slate-100 border-slate-300 text-slate-500 line-through hover:bg-slate-200'
                  }`}
                >
                  {segment.content}
                  <Ban className="w-3.5 h-3.5" />
                </button>
                {showAffordances && (
                  <>
                    <span
                      onMouseDown={handleResizeStart(key, 'start')}
                      className={`${handleClass} -left-0.5`}
                      title="Drag to resize"
                    />
                    <span
                      onMouseDown={handleResizeStart(key, 'end')}
                      className={`${handleClass} -right-0.5`}
                      title="Drag to resize"
                    />
                  </>
                )}
              </span>
            );
          }

          if (isNoneMatch) {
            return (
              <span key={i} className={wrapperClass}>
                <button
                  data-seg-start={segment.start}
                  data-seg-end={segment.end}
                  data-seg-type="entity"
                  onClick={() => onEntityClick(isActive ? '' : key)}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed text-base font-medium transition-all ${
                    isActive
                      ? 'bg-blue-100 border-blue-500 text-blue-900 ring-2 ring-blue-300'
                      : 'bg-violet-100 border-violet-400 text-violet-800 hover:bg-violet-200'
                  }`}
                >
                  {segment.content}
                  <HelpCircle className="w-3.5 h-3.5 text-violet-500" />
                </button>
                {showAffordances && (
                  <>
                    <span
                      onMouseDown={handleResizeStart(key, 'start')}
                      className={`${handleClass} -left-0.5`}
                      title="Drag to resize"
                    />
                    <span
                      onMouseDown={handleResizeStart(key, 'end')}
                      className={`${handleClass} -right-0.5`}
                      title="Drag to resize"
                    />
                  </>
                )}
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-slate-800 rounded shadow-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50 pointer-events-none">
                  Correct concept not listed — needs manual entry
                  <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                </span>
              </span>
            );
          }

          const verdict = certaintyMap[key];
          const styles = getEntityStyles(isReviewed, isActive, false, verdict, entity.candidates.length > 0);
          const topScore = entity.candidates[0]?.score ?? 0;

          const getTooltip = () => {
            if (entity.candidates.length === 0) return 'New span — no candidates yet';
            const label = verdict ? verdict.charAt(0).toUpperCase() + verdict.slice(1) : 'Not analyzed';
            return `Certainty: ${label} — Match ${(topScore * 100).toFixed(1)}%`;
          };

          const tooltipText = isReviewed ? 'Confirmed' : getTooltip();

          return (
            <span key={i} className={wrapperClass}>
              <button
                data-seg-start={segment.start}
                data-seg-end={segment.end}
                data-seg-type="entity"
                onClick={() => onEntityClick(isActive ? '' : key)}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-base font-medium transition-all ${styles}`}
              >
                {segment.content}
                {isReviewed && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                {!isReviewed && entity.candidates.length > 0 && (
                  <span className={`text-xs font-normal ${getBadgeColor(verdict)}`}>
                    {getCertaintyLabel(verdict) ?? ''}
                  </span>
                )}
              </button>
              {showAffordances && (
                <>
                  <span
                    onMouseDown={handleResizeStart(key, 'start')}
                    className={`${handleClass} -left-0.5`}
                    title="Drag to resize"
                  />
                  <span
                    onMouseDown={handleResizeStart(key, 'end')}
                    className={`${handleClass} -right-0.5`}
                    title="Drag to resize"
                  />
                </>
              )}
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-slate-800 rounded shadow-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50 pointer-events-none">
                {tooltipText}
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
              </span>
            </span>
          );
        })}
      </div>

      {pending && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleCreateClick}
          style={{
            position: 'fixed',
            left: pending.left,
            top: pending.top - 8,
            transform: 'translate(-50%, -100%)',
          }}
          className="z-50 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded shadow-lg"
        >
          <Plus className="w-3.5 h-3.5" />
          Tag entity
        </button>
      )}
    </>
  );
}
