import { useState, useEffect, useRef } from 'react';
import { X, Check, Ban, GitBranch, Quote, ArrowLeft, ArrowRight, GripVertical, HelpCircle, Search, Loader2, ExternalLink, PenLine } from 'lucide-react';
import { LinkedEntity, NOT_LINKED, NONE_MATCH, UNSURE, ConceptCandidate, HierarchyResponse, AnalysisResult } from '../types';
import { LLMExplanationPanel, VerdictBadge } from './LLMExplanation';
import { EmbeddedGraph } from './EmbeddedGraph';

const DEFAULT_PANEL_WIDTH = 520;
const MIN_PANEL_WIDTH = 400;
const MAX_PANEL_WIDTH = 900;
const PENDING_DELETE = '__DELETE__';

interface MentionPanelProps {
  entity: LinkedEntity | null;
  entityKey: string | null;
  noteText: string;
  annotation: string | undefined;
  onSelect: (conceptId: string) => void;
  onDelete: () => void;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
  currentIndex: number;
  totalCount: number;
  onWidthChange?: (width: number) => void;
  supportsHierarchy: boolean;
  fetchHierarchy: (conceptId: string) => Promise<HierarchyResponse | null>;
  supportsConceptSearch: boolean;
  onFetchCandidates: (entityKey: string) => Promise<void>;
  onAnalyzeEntity?: (entity: LinkedEntity, noteText: string) => Promise<AnalysisResult>;
  backendLlmModel?: string | null;
}

type TabType = 'candidates' | 'hierarchy';

function getScoreTextColor(score: number): string {
  if (score >= 0.98) return 'text-emerald-600';
  if (score >= 0.96) return 'text-emerald-500';
  if (score >= 0.94) return 'text-teal-500';
  if (score >= 0.92) return 'text-cyan-600';
  if (score >= 0.90) return 'text-sky-600';
  if (score >= 0.80) return 'text-amber-500';
  if (score >= 0.60) return 'text-orange-500';
  return 'text-rose-600';
}

function ContextPreview({ text, start, end, mention }: { text: string; start: number; end: number; mention: string }) {
  const contextBefore = text.slice(Math.max(0, start - 100), start);
  const contextAfter = text.slice(end, Math.min(text.length, end + 100));

  return (
    <div className="bg-slate-50 rounded-lg p-3 text-sm">
      <div className="flex items-start gap-2">
        <Quote className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
        <p className="text-slate-600 leading-relaxed">
          <span className="text-slate-400">...</span>
          {contextBefore}
          <mark className="bg-yellow-200 text-slate-800 px-0.5 rounded font-medium">{mention}</mark>
          {contextAfter}
          <span className="text-slate-400">...</span>
        </p>
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  isConfirmed,
  isHighlighted,
  isPending,
  onSelect,
  onConfirm,
  onViewHierarchy,
  index,
  showHierarchyButton,
}: {
  candidate: ConceptCandidate;
  isConfirmed: boolean;
  isHighlighted: boolean;
  isPending: boolean;
  onSelect: () => void;
  onConfirm: () => void;
  onViewHierarchy: () => void;
  index: number;
  showHierarchyButton: boolean;
}) {
  return (
    <div
      className={`group rounded-lg border-2 transition-all ${
        isPending
          ? 'border-blue-500 bg-blue-50'
          : isConfirmed
          ? 'border-emerald-500 bg-emerald-50'
          : isHighlighted
          ? 'border-slate-300 bg-slate-50'
          : 'border-transparent bg-white hover:bg-slate-50'
      }`}
    >
      <div className="flex items-stretch">
        <button onClick={onSelect} className="flex-1 text-left p-3">
          <div className="flex items-start gap-3">
            {candidate.manual ? (
              <div className="flex-shrink-0 w-16 flex flex-col items-center">
                <PenLine className="w-5 h-5 text-violet-500" />
                <div className="text-xs text-slate-400">#{index + 1}</div>
              </div>
            ) : (
              <div className="flex-shrink-0 w-16 text-center">
                <div className={`text-lg font-bold ${getScoreTextColor(candidate.score)}`}>
                  {(candidate.score * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-slate-400">#{index + 1}</div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800">{candidate.term}</span>
                {candidate.manual && <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-violet-100 text-violet-700 rounded">Manual</span>}
                {isConfirmed && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono text-slate-400">{candidate.conceptId}</span>
                {!candidate.manual && (
                  <>
                    <span className="text-xs text-slate-300">&middot;</span>
                    <span className="text-xs text-slate-500">{candidate.semanticTag}</span>
                  </>
                )}
              </div>
              {!candidate.manual && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{candidate.fsn}</p>}
            </div>
          </div>
        </button>
        {showHierarchyButton && (
          <button
            onClick={onViewHierarchy}
            className="px-3 flex items-center justify-center border-l border-slate-100 hover:bg-blue-50 transition-colors"
            title="View hierarchy"
          >
            <GitBranch className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
          </button>
        )}
      </div>
      {isPending && (
        <div className="px-3 pb-3 pt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onConfirm(); }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Check className="w-4 h-4" />
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

export function MentionPanel({
  entity,
  entityKey,
  noteText,
  annotation,
  onSelect,
  onDelete,
  onClose,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  currentIndex,
  totalCount,
  onWidthChange,
  supportsHierarchy,
  fetchHierarchy,
  supportsConceptSearch,
  onFetchCandidates,
  onAnalyzeEntity,
  backendLlmModel,
}: MentionPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('candidates');
  const [hierarchyConceptId, setHierarchyConceptId] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isFetchingCandidates, setIsFetchingCandidates] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [manualConceptId, setManualConceptId] = useState('');
  const manualInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(DEFAULT_PANEL_WIDTH);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = resizeStartX.current - e.clientX;
      const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, resizeStartWidth.current + deltaX));
      setPanelWidth(newWidth);
      onWidthChange?.(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, onWidthChange]);

  useEffect(() => {
    onWidthChange?.(entity ? panelWidth : 0);
  }, [entity, panelWidth, onWidthChange]);

  useEffect(() => {
    setActiveTab('candidates');
    setHighlightedIndex(0);
    setFetchError(null);
    setPendingSelection(null);
    setManualConceptId('');
    if (entity && entity.candidates.length > 0) {
      const selected = annotation && annotation !== NOT_LINKED && annotation !== UNSURE ? annotation : entity.candidates[0]?.conceptId;
      setHierarchyConceptId(selected || null);
    } else {
      setHierarchyConceptId(null);
    }
  }, [entityKey, entity, annotation]);

  const handleFetchCandidates = async () => {
    if (!entityKey || isFetchingCandidates) return;
    setIsFetchingCandidates(true);
    setFetchError(null);
    try {
      await onFetchCandidates(entityKey);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch candidates');
    } finally {
      setIsFetchingCandidates(false);
    }
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = panelWidth;
    setIsResizing(true);
  };

  const isNoneMatch = annotation === NONE_MATCH;
  const isUnsure = annotation === UNSURE;
  const confirmedConceptId = (isNoneMatch || isUnsure) ? null : (annotation || null);

  const isPendingNoneMatch = pendingSelection === NONE_MATCH;
  const isPendingDelete = pendingSelection === PENDING_DELETE;
  const isPendingUnsure = pendingSelection === UNSURE;

  const handleConfirm = () => {
    if (!pendingSelection) return;
    if (pendingSelection === PENDING_DELETE) {
      onDelete();
    } else {
      onSelect(pendingSelection);
    }
    setPendingSelection(null);
  };

  useEffect(() => {
    if (!entity) return;
    const getHighlightedValue = (): string | null => {
      if (highlightedIndex < entity.candidates.length) {
        return entity.candidates[highlightedIndex].conceptId;
      } else if (highlightedIndex === entity.candidates.length) {
        return NONE_MATCH;
      } else if (highlightedIndex === entity.candidates.length + 1) {
        return PENDING_DELETE;
      } else if (highlightedIndex === entity.candidates.length + 2) {
        return UNSURE;
      }
      return null;
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      const totalOptions = entity.candidates.length + 3;
      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          setHighlightedIndex(prev => Math.min(prev + 1, totalOptions - 1));
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          setHighlightedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter': {
          e.preventDefault();
          const value = getHighlightedValue();
          if (value !== null && value === pendingSelection) {
            if (pendingSelection === PENDING_DELETE) {
              onDelete();
            } else {
              onSelect(pendingSelection);
            }
            setPendingSelection(null);
          } else {
            setPendingSelection(value);
          }
          break;
        }
        case 'h':
          if (supportsHierarchy && highlightedIndex < entity.candidates.length) {
            e.preventDefault();
            setHierarchyConceptId(entity.candidates[highlightedIndex].conceptId);
            setActiveTab('hierarchy');
          }
          break;
        case 'n':
          e.preventDefault();
          onDelete();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (hasPrevious) onPrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (hasNext) onNext();
          break;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) { if (hasPrevious) onPrevious(); }
          else { if (hasNext) onNext(); }
          break;
        case 'Escape':
          e.preventDefault();
          if (pendingSelection) setPendingSelection(null);
          else if (activeTab === 'hierarchy') setActiveTab('candidates');
          else onClose();
          break;
        case '1': case '2': case '3': case '4': case '5': {
          e.preventDefault();
          const idx = parseInt(e.key) - 1;
          if (idx < entity.candidates.length) {
            setPendingSelection(entity.candidates[idx].conceptId);
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [entity, highlightedIndex, activeTab, pendingSelection, onSelect, onDelete, onClose, onNext, onPrevious, hasNext, hasPrevious, supportsHierarchy]);

  useEffect(() => {
    if (!pendingSelection || !scrollContainerRef.current) return;
    requestAnimationFrame(() => {
      const el = scrollContainerRef.current?.querySelector(`[data-option-id="${pendingSelection}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [pendingSelection]);

  if (!entity || !entityKey) return null;

  const handleViewHierarchy = (conceptId: string) => {
    setHierarchyConceptId(conceptId);
    setActiveTab('hierarchy');
  };

  return (
    <div className="fixed top-0 right-0 h-full bg-white border-l border-slate-200 shadow-xl z-50 flex flex-col" style={{ width: panelWidth }}>
      <div
        className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-blue-500/20 active:bg-blue-500/30 transition-colors z-10 flex items-center justify-center group"
        onMouseDown={startResize}
        title="Drag to resize"
      >
        <GripVertical className="w-3 h-3 text-slate-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="flex-shrink-0 border-b border-slate-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-slate-800">Review Mention</h2>
            <span className="text-xs text-slate-400">{currentIndex + 1} of {totalCount}</span>
            {entity.verdict && <VerdictBadge verdict={entity.verdict} />}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onPrevious} disabled={!hasPrevious} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors" title="Previous (←/Shift+Tab)">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button onClick={onNext} disabled={!hasNext} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors" title="Next (→/Tab)">
              <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors ml-2" title="Close (Esc)">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl font-bold text-slate-800">"{entity.mention}"</span>
            <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded">{entity.entityType}</span>
          </div>
          <ContextPreview text={noteText} start={entity.start} end={entity.end} mention={entity.mention} />
        </div>

        <div className="flex border-t border-slate-100">
          <button
            onClick={() => setActiveTab('candidates')}
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'candidates' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Candidates ({entity.candidates.length})
          </button>
          {supportsHierarchy && (
            <button
              onClick={() => setActiveTab('hierarchy')}
              className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'hierarchy' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <GitBranch className="w-4 h-4" />
                Hierarchy
              </span>
            </button>
          )}
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {activeTab === 'candidates' && (
          <div className="p-4 space-y-4">
            {entity.candidates.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                <p className="text-sm text-slate-600 mb-3">
                  No candidates yet for <span className="font-medium">"{entity.mention}"</span>.
                </p>
                {supportsConceptSearch && (
                  <>
                    <button
                      onClick={handleFetchCandidates}
                      disabled={isFetchingCandidates}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg transition-colors"
                    >
                      {isFetchingCandidates ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Searching...</>
                      ) : (
                        <><Search className="w-4 h-4" />Fetch SNOMED candidates</>
                      )}
                    </button>
                    {fetchError && (
                      <p className="mt-2 text-xs text-rose-600">{fetchError}</p>
                    )}
                  </>
                )}
                {!supportsConceptSearch && (
                  <p className="text-xs text-slate-500 mt-2">
                    The current resolver doesn't support concept search. Mark the span as not-linked, or remove it.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              {entity.candidates.map((candidate, idx) => (
                <div key={candidate.conceptId} data-option-id={candidate.conceptId}>
                  <CandidateCard
                    candidate={candidate}
                    isConfirmed={candidate.conceptId === confirmedConceptId}
                    isHighlighted={idx === highlightedIndex}
                    isPending={pendingSelection === candidate.conceptId}
                    onSelect={() => setPendingSelection(candidate.conceptId)}
                    onConfirm={handleConfirm}
                    onViewHierarchy={() => handleViewHierarchy(candidate.conceptId)}
                    index={idx}
                    showHierarchyButton={supportsHierarchy}
                  />
                </div>
              ))}

              <div data-option-id={NONE_MATCH} className={`rounded-lg border-2 transition-all ${
                isPendingNoneMatch
                  ? 'border-amber-500 bg-amber-50'
                  : isNoneMatch
                  ? 'border-emerald-500 bg-emerald-50'
                  : highlightedIndex === entity.candidates.length
                  ? 'border-slate-300 bg-slate-50'
                  : 'border-transparent bg-white hover:bg-slate-50'
              }`}>
                <button onClick={() => setPendingSelection(NONE_MATCH)} className="w-full text-left p-3 flex items-center gap-3">
                  <div className="flex-shrink-0 w-12 flex justify-center">
                    <HelpCircle className={`w-5 h-5 ${(isPendingNoneMatch || isNoneMatch) ? 'text-amber-500' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${(isPendingNoneMatch || isNoneMatch) ? 'text-amber-700' : 'text-slate-600'}`}>Correct concept not listed</span>
                      {isNoneMatch && <Check className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">The right SNOMED concept exists but isn't in these candidates</p>
                  </div>
                </button>
                {isPendingNoneMatch && (
                  <div className="px-3 pb-3 pt-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Confirm
                    </button>
                  </div>
                )}
              </div>

              <div data-option-id={NOT_LINKED} className={`rounded-lg border-2 transition-all ${
                isPendingDelete
                  ? 'border-rose-500 bg-rose-50'
                  : highlightedIndex === entity.candidates.length + 1
                  ? 'border-slate-300 bg-slate-50'
                  : 'border-transparent bg-white hover:bg-slate-50'
              }`}>
                <button onClick={() => setPendingSelection(PENDING_DELETE)} className="w-full text-left p-3 flex items-center gap-3">
                  <div className="flex-shrink-0 w-12 flex justify-center">
                    <Ban className={`w-5 h-5 ${isPendingDelete ? 'text-rose-500' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isPendingDelete ? 'text-rose-700' : 'text-slate-600'}`}>Not a SNOMED concept</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Remove this entity from the annotation</p>
                  </div>
                </button>
                {isPendingDelete && (
                  <div className="px-3 pb-3 pt-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
                    >
                      <Ban className="w-4 h-4" />
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <div className={`rounded-lg border-2 transition-all ${
                isPendingUnsure
                  ? 'border-slate-500 bg-slate-100'
                  : isUnsure
                  ? 'border-emerald-500 bg-emerald-50'
                  : highlightedIndex === entity.candidates.length + 2
                  ? 'border-slate-300 bg-slate-50'
                  : 'border-transparent bg-white hover:bg-slate-50'
              }`}>
                <button onClick={() => setPendingSelection(UNSURE)} className="w-full text-left p-3 flex items-center gap-3">
                  <div className="flex-shrink-0 w-12 flex justify-center">
                    <HelpCircle className={`w-5 h-5 ${(isPendingUnsure || isUnsure) ? 'text-slate-600' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${(isPendingUnsure || isUnsure) ? 'text-slate-700' : 'text-slate-600'}`}>Uncertain</span>
                      {isUnsure && <Check className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Not confident enough to annotate — flag for review</p>
                  </div>
                </button>
                {isPendingUnsure && (
                  <div className="px-3 pb-3 pt-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-slate-600 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Confirm
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <a
                  href="https://browser.ihtsdotools.org/?perspective=full&conceptId1=404684003&edition=MAIN/2026-05-01&release=&languages=en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Manual Search
                </a>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = manualConceptId.trim();
                  if (trimmed) {
                    onSelect(trimmed);
                    setManualConceptId('');
                  }
                }}
                className="flex items-center gap-2"
              >
                <input
                  ref={manualInputRef}
                  type="text"
                  value={manualConceptId}
                  onChange={(e) => setManualConceptId(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Enter SNOMED CT concept ID"
                  className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={!manualConceptId.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Apply
                </button>
              </form>
            </div>

            <div className="pt-2">
              <LLMExplanationPanel entity={entity} noteText={noteText} entityKey={entityKey} onSelectConcept={(conceptId) => setPendingSelection(conceptId)} onAnalyze={onAnalyzeEntity} backendLlmModel={backendLlmModel} />
            </div>
          </div>
        )}

        {activeTab === 'hierarchy' && (
          <div className="h-full">
            {hierarchyConceptId ? (
              <EmbeddedGraph
                conceptId={hierarchyConceptId}
                onNavigate={setHierarchyConceptId}
                onSelect={(conceptId) => { setPendingSelection(conceptId); setActiveTab('candidates'); }}
                containerWidth={panelWidth}
                fetchHierarchy={fetchHierarchy}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <GitBranch className="w-12 h-12 mb-3" />
                <p className="text-sm">Select a candidate and press 'h' to view hierarchy</p>
                <p className="text-xs mt-1">Or click the branch icon next to a candidate</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
        <span><kbd className="px-1 bg-white rounded border">↑↓</kbd> navigate</span>
        <span><kbd className="px-1 bg-white rounded border">↵</kbd> select / confirm</span>
        <span><kbd className="px-1 bg-white rounded border">1-5</kbd> quick select</span>
        {supportsHierarchy && <span><kbd className="px-1 bg-white rounded border">h</kbd> hierarchy</span>}
        <span><kbd className="px-1 bg-white rounded border">n</kbd> remove</span>
        <span><kbd className="px-1 bg-white rounded border">Esc</kbd> deselect</span>
        <span><kbd className="px-1 bg-white rounded border">←→</kbd> prev/next mention</span>
      </div>
    </div>
  );
}
