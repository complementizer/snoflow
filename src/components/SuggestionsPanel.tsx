import { AlertTriangle, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { LinkedEntity, NOT_LINKED, getSuggestions, isUncertain, ExplanationVerdict } from '../types';

interface SuggestionsPanelProps {
  entities: LinkedEntity[];
  annotations: Record<string, string>;
  confirmed: Set<string>;
  onEntityClick: (entityKey: string) => void;
  getEntityKey: (entity: LinkedEntity) => string;
  certaintyMap: Record<string, ExplanationVerdict>;
}

type AttentionCategory = 'no_match' | 'uncertain' | 'low_match' | 'close_scores';

function getAttentionCategory(verdict: ExplanationVerdict | undefined, suggestions: ReturnType<typeof getSuggestions>): AttentionCategory {
  if (verdict === 'no_match') return 'no_match';
  if (verdict === 'ambiguous' || verdict === 'uncertain') return 'uncertain';
  const type = suggestions[0]?.type;
  if (type === 'low_match' || type === 'close_scores') return type;
  return 'uncertain';
}

function AttentionIcon({ category, className = 'w-4 h-4' }: { category: AttentionCategory; className?: string }) {
  switch (category) {
    case 'no_match': return <AlertCircle className={`${className} text-violet-500`} />;
    case 'uncertain': return <AlertTriangle className={`${className} text-rose-500`} />;
    case 'low_match': return <AlertCircle className={`${className} text-rose-500`} />;
    case 'close_scores': return <AlertTriangle className={`${className} text-amber-500`} />;
  }
}

const categoryBadge: Record<AttentionCategory, { bg: string; text: string; border: string; label: string }> = {
  no_match: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', label: 'no match' },
  uncertain: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'uncertain' },
  low_match: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'low match' },
  close_scores: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'close scores' },
};

const categoryOrder: AttentionCategory[] = ['no_match', 'uncertain', 'low_match', 'close_scores'];

const fallbackMessages: Record<AttentionCategory, string> = {
  no_match: 'No candidate matches this mention',
  uncertain: 'Ambiguous or uncertain match',
  low_match: 'Low match score',
  close_scores: 'Close candidate scores',
};

export function SuggestionsPanel({ entities, annotations, confirmed, onEntityClick, getEntityKey, certaintyMap }: SuggestionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const entitiesWithIssues: Array<{
    entity: LinkedEntity; key: string;
    suggestions: ReturnType<typeof getSuggestions>;
    category: AttentionCategory;
  }> = [];

  entities.forEach(entity => {
    const key = getEntityKey(entity);
    const suggestions = getSuggestions(entity);
    const verdict = certaintyMap[key];
    if ((suggestions.length > 0 || isUncertain(verdict)) && !confirmed.has(key)) {
      entitiesWithIssues.push({ entity, key, suggestions, category: getAttentionCategory(verdict, suggestions) });
    }
  });

  entitiesWithIssues.sort((a, b) => (a.entity.candidates[0]?.score ?? 0) - (b.entity.candidates[0]?.score ?? 0));

  const reviewedCount = confirmed.size;
  const totalCount = entities.length;
  const notLinkedCount = Object.values(annotations).filter(a => a === NOT_LINKED).length;

  const categoryCounts: Partial<Record<AttentionCategory, number>> = {};
  entitiesWithIssues.forEach(({ category }) => {
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <span className="font-semibold text-slate-800">Needs Attention</span>
          {entitiesWithIssues.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">{entitiesWithIssues.length}</span>
          )}
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {isExpanded && (
        <>
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {categoryOrder.map(cat => {
              const count = categoryCounts[cat];
              if (!count) return null;
              const s = categoryBadge[cat];
              return (
                <span key={cat} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${s.bg} ${s.text} border ${s.border}`}>
                  <AttentionIcon category={cat} className="w-3 h-3" />
                  {count} {s.label}
                </span>
              );
            })}
            {notLinkedCount > 0 && <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">{notLinkedCount} not linked</span>}
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3" />{reviewedCount}/{totalCount} reviewed</span>
          </div>

          <div className="border-t border-slate-100 max-h-64 overflow-y-auto">
            {entitiesWithIssues.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-emerald-600">All clear!</p>
                <p className="text-xs text-slate-500 mt-1">No issues need attention</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {entitiesWithIssues.map(({ entity, key, suggestions, category }) => (
                  <button key={key} onClick={() => onEntityClick(key)} className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <AttentionIcon category={category} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800 text-sm truncate">"{entity.mention}"</span>
                          <span className="text-xs text-slate-400">{((entity.candidates[0]?.score ?? 0) * 100).toFixed(1)}%</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{suggestions[0]?.message ?? fallbackMessages[category]}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Review progress</span>
              <span>{Math.round((reviewedCount / Math.max(totalCount, 1)) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${(reviewedCount / Math.max(totalCount, 1)) * 100}%` }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
