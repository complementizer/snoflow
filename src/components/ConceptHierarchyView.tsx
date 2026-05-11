import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Loader2, AlertCircle, Check, ArrowUpRight } from 'lucide-react';
import { ConceptInfo, HierarchyResponse } from '../types';

interface ConceptHierarchyViewProps {
  conceptId: string;
  onNavigate: (conceptId: string) => void;
  onSelect?: (conceptId: string) => void;
  fetchHierarchy: (conceptId: string) => Promise<HierarchyResponse | null>;
}

function ConceptNode({ concept, isSelected, isRoot, onNavigate, onSelect }: {
  concept: ConceptInfo; isSelected?: boolean; isRoot?: boolean;
  onNavigate: (conceptId: string) => void; onSelect?: (conceptId: string) => void;
}) {
  return (
    <div className={`rounded-lg border transition-all ${
      isSelected ? 'border-blue-500 bg-blue-50' : isRoot ? 'border-slate-300 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'
    }`}>
      <div className="flex items-stretch">
        <button onClick={() => onNavigate(concept.conceptId)} className="flex-1 text-left p-2.5">
          <div className="font-medium text-sm text-slate-800 line-clamp-2">{concept.term}</div>
          <div className="text-xs text-slate-400 font-mono mt-0.5">{concept.conceptId}</div>
        </button>
        {onSelect && (
          <button onClick={() => onSelect(concept.conceptId)} className="px-2.5 flex items-center justify-center border-l border-slate-100 hover:bg-emerald-50 transition-colors" title="Select this concept">
            <Check className="w-4 h-4 text-slate-400 hover:text-emerald-600" />
          </button>
        )}
      </div>
    </div>
  );
}

function ConceptList({ title, concepts, emptyMessage, onNavigate, onSelect, truncated }: {
  title: string; concepts: ConceptInfo[]; emptyMessage: string;
  onNavigate: (conceptId: string) => void; onSelect?: (conceptId: string) => void; truncated?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <div>
      <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 hover:text-slate-700">
        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {title} ({concepts.length}{truncated ? '+' : ''})
      </button>
      {isExpanded && (
        <div className="space-y-1.5 pl-2">
          {concepts.length === 0 ? (
            <p className="text-xs text-slate-400 italic">{emptyMessage}</p>
          ) : (
            <>
              {concepts.map(concept => <ConceptNode key={concept.conceptId} concept={concept} onNavigate={onNavigate} onSelect={onSelect} />)}
              {truncated && <p className="text-xs text-slate-400 italic">More children not shown...</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ConceptHierarchyView({ conceptId, onNavigate, onSelect, fetchHierarchy }: ConceptHierarchyViewProps) {
  const [hierarchy, setHierarchy] = useState<HierarchyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      const result = await fetchHierarchy(conceptId);
      if (!cancelled) {
        if (result) setHierarchy(result);
        else setError('Failed to load hierarchy');
        setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [conceptId, fetchHierarchy]);

  const handleNavigate = (newConceptId: string) => {
    if (newConceptId !== conceptId) {
      setHistory(prev => [...prev, conceptId]);
      onNavigate(newConceptId);
    }
  };

  const handleBack = () => {
    if (history.length > 0) {
      const previousId = history[history.length - 1];
      setHistory(prev => prev.slice(0, -1));
      onNavigate(previousId);
    }
  };

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400"><Loader2 className="w-8 h-8 animate-spin mb-2" /><p className="text-sm">Loading hierarchy...</p></div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400"><AlertCircle className="w-8 h-8 mb-2 text-rose-400" /><p className="text-sm text-rose-600">{error}</p></div>
  );
  if (!hierarchy) return null;

  return (
    <div className="p-4 space-y-4">
      {history.length > 0 && (
        <button onClick={handleBack} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
          <ArrowUpRight className="w-3.5 h-3.5 rotate-[225deg]" />Back to previous
        </button>
      )}
      <div>
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Selected Concept</div>
        <ConceptNode concept={hierarchy.concept} isSelected isRoot onNavigate={handleNavigate} onSelect={onSelect} />
      </div>
      <ConceptList title="Parents" concepts={hierarchy.parents} emptyMessage="No parents (root concept)" onNavigate={handleNavigate} onSelect={onSelect} />
      <ConceptList title="Children" concepts={hierarchy.children} emptyMessage="No children (leaf concept)" onNavigate={handleNavigate} onSelect={onSelect} truncated={hierarchy.childrenTruncated} />
      {hierarchy.relationships.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Relationships ({hierarchy.relationships.length})</div>
          <div className="space-y-1.5 pl-2">
            {hierarchy.relationships.slice(0, 10).map((rel, idx) => (
              <div key={idx} className="text-xs bg-slate-50 rounded-lg p-2 border border-slate-100">
                <span className="text-slate-500">{rel.type}:</span>{' '}
                <button onClick={() => handleNavigate(rel.target.conceptId)} className="text-blue-600 hover:underline">{rel.target.term}</button>
              </div>
            ))}
            {hierarchy.relationships.length > 10 && <p className="text-xs text-slate-400 italic">+{hierarchy.relationships.length - 10} more...</p>}
          </div>
        </div>
      )}
    </div>
  );
}
