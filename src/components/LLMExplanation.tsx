import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Loader2, AlertCircle, CheckCircle, HelpCircle, AlertTriangle, Settings, ThumbsUp, Server } from 'lucide-react';
import { LinkedEntity, ExplanationVerdict, AnalysisResult } from '../types';
import { useLLM } from '../contexts/LLMContext';

interface LLMExplanationProps {
  entity: LinkedEntity;
  noteText: string;
  entityKey: string;
  onSelectConcept?: (conceptId: string) => void;
  onAnalyze?: (entity: LinkedEntity, noteText: string) => Promise<AnalysisResult>;
  backendLlmModel?: string | null;
}

export function VerdictBadge({ verdict }: { verdict: ExplanationVerdict }) {
  const config: Record<ExplanationVerdict, { bg: string; text: string; border: string; icon: React.ReactNode; label: string }> = {
    confident: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', icon: <CheckCircle className="w-3.5 h-3.5" />, label: 'Confident' },
    likely: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200', icon: <CheckCircle className="w-3.5 h-3.5" />, label: 'Likely' },
    ambiguous: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', icon: <HelpCircle className="w-3.5 h-3.5" />, label: 'Ambiguous' },
    uncertain: { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200', icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'Uncertain' },
    no_match: { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-200', icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'No Match' },
  };
  const c = config[verdict];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${c.bg} ${c.text} ${c.border}`}>{c.icon}{c.label}</span>;
}

export function LLMExplanationPanel({ entity, noteText, entityKey, onSelectConcept, onAnalyze, backendLlmModel }: LLMExplanationProps) {
  const { settings, provider, openModal, getAnalysis, cacheAnalysis } = useLLM();
  const [isLoading, setIsLoading] = useState(false);
  const hasBackendLinking = !!entity.linkedViaBackend;
  const [isExpanded, setIsExpanded] = useState(hasBackendLinking);
  const cachedAnalysis = getAnalysis(entityKey);

  const canAnalyze = !!onAnalyze || settings.isConfigured;
  const isViaBackend = !!onAnalyze;

  const modelName = isViaBackend
    ? (backendLlmModel || null)
    : settings.provider === 'openai'
    ? settings.openaiModel
    : settings.azureDeployment || null;

  const backendExplanation = hasBackendLinking ? {
    verdict: entity.verdict || 'uncertain' as ExplanationVerdict,
    recommendedConceptId: entity.recommendedConceptId ?? null,
    reasoning: entity.explanation || '',
    keyFactors: entity.keyFactors || [],
    ambiguityNote: entity.ambiguityNote,
    alternativeConsiderations: entity.alternativeConsiderations,
  } : null;

  const explanation = cachedAnalysis || backendExplanation;
  const linkingError = entity.linkingError;

  const handleAnalyze = async () => {
    setIsLoading(true);
    try {
      let result: AnalysisResult;
      if (onAnalyze) {
        result = await onAnalyze(entity, noteText);
      } else if (provider) {
        result = await provider.analyzeEntity(entity, noteText);
      } else {
        return;
      }
      cacheAnalysis(entityKey, result);
    } catch (err) {
      cacheAnalysis(entityKey, {
        verdict: 'uncertain',
        recommendedConceptId: null,
        reasoning: 'Analysis failed',
        keyFactors: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!explanation && !isLoading) {
    return (
      <div className="border border-indigo-200 rounded-lg bg-gradient-to-br from-indigo-50 to-white overflow-hidden">
        <div className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span className="font-medium text-slate-800 text-sm">Verdict</span>
            {modelName && <span className="text-[10px] font-mono text-slate-400">{modelName}</span>}
            {isViaBackend && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded">
                <Server className="w-2.5 h-2.5" />backend
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!canAnalyze && (
              <button onClick={openModal} className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors" title="Configure LLM">
                <Settings className="w-3.5 h-3.5" />Configure
              </button>
            )}
            <button onClick={handleAnalyze} disabled={!canAnalyze}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors">
              <Sparkles className="w-3.5 h-3.5" />Analyze
            </button>
          </div>
        </div>
        {linkingError && (
          <div className="px-3 pb-3 border-t border-rose-100">
            <div className="py-3 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-rose-700 font-medium">Backend LLM analysis failed</p>
                <p className="text-rose-600 text-xs mt-1">{linkingError}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isFromBackend = !cachedAnalysis && backendExplanation;

  return (
    <div className="border border-indigo-200 rounded-lg bg-gradient-to-br from-indigo-50 to-white overflow-hidden">
      <div onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center justify-between p-3 hover:bg-indigo-50/50 transition-colors cursor-pointer" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsExpanded(!isExpanded); } }}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <span className="font-medium text-slate-800 text-sm">Verdict</span>
          {!isLoading && explanation && !('error' in explanation && explanation.error) && <VerdictBadge verdict={explanation.verdict} />}
          {modelName && <span className="text-[10px] font-mono text-slate-400">{modelName}</span>}
          {isFromBackend && <span className="text-[10px] text-slate-400 uppercase tracking-wide">Backend</span>}
          {isViaBackend && !isFromBackend && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded">
              <Server className="w-2.5 h-2.5" />backend
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && canAnalyze && (
            <button onClick={(e) => { e.stopPropagation(); handleAnalyze(); }} className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-100 rounded transition-colors">
              Re-analyze
            </button>
          )}
          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 border-t border-indigo-100">
          {isLoading && (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              {isViaBackend ? 'Calling /api/v1/linking...' : 'Analyzing with AI...'}
            </div>
          )}

          {explanation && 'error' in explanation && explanation.error && (
            <div className="py-3 text-sm text-slate-500 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
              <div><p className="text-rose-600">{explanation.error}</p></div>
            </div>
          )}

          {!isLoading && explanation && !('error' in explanation && explanation.error) && (
            <div className="space-y-3 pt-3">
              <p className="text-sm text-slate-700 leading-relaxed">{explanation.reasoning}</p>

              {explanation.keyFactors.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Key Factors</h5>
                  <ul className="space-y-1">
                    {explanation.keyFactors.map((factor, idx) => <li key={idx} className="flex items-start gap-2 text-sm text-slate-600"><span className="text-indigo-400 mt-1">•</span>{factor}</li>)}
                  </ul>
                </div>
              )}

              {explanation.ambiguityNote && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  <div className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" /><p className="text-sm text-amber-800">{explanation.ambiguityNote}</p></div>
                </div>
              )}

              {explanation.alternativeConsiderations && explanation.alternativeConsiderations.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Alternatives to Consider</h5>
                  <ul className="space-y-1">
                    {explanation.alternativeConsiderations.map((alt, idx) => (
                      <li key={idx} className="text-sm text-slate-600"><span className="font-mono text-xs text-slate-400">{alt.conceptId}</span><span className="mx-1">—</span>{alt.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {explanation.recommendedConceptId === '__NOT_LINKED__' && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-rose-800"><strong>AI suggests:</strong> Not a medical/SNOMED concept</p>
                    {onSelectConcept && <button onClick={() => onSelectConcept('__NOT_LINKED__')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors flex-shrink-0"><ThumbsUp className="w-3.5 h-3.5" />Accept</button>}
                  </div>
                </div>
              )}

              {explanation.recommendedConceptId === '__NONE_MATCH__' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-amber-800"><strong>AI suggests:</strong> Correct concept not in candidates</p>
                    {onSelectConcept && <button onClick={() => onSelectConcept('__NONE_MATCH__')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors flex-shrink-0"><ThumbsUp className="w-3.5 h-3.5" />Accept</button>}
                  </div>
                </div>
              )}

              {explanation.recommendedConceptId && explanation.recommendedConceptId !== '__NOT_LINKED__' && explanation.recommendedConceptId !== '__NONE_MATCH__' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-emerald-800"><strong>Recommended:</strong> <span className="font-mono text-xs">{explanation.recommendedConceptId}</span></p>
                    {onSelectConcept && <button onClick={() => onSelectConcept(explanation.recommendedConceptId!)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex-shrink-0"><ThumbsUp className="w-3.5 h-3.5" />Accept</button>}
                  </div>
                </div>
              )}

              {!explanation.recommendedConceptId && explanation.verdict === 'confident' && entity.candidates[0] && onSelectConcept && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-emerald-800"><strong>AI confirms top candidate:</strong> <span className="font-mono text-xs">{entity.candidates[0].conceptId}</span></p>
                    <button onClick={() => onSelectConcept(entity.candidates[0].conceptId)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex-shrink-0"><ThumbsUp className="w-3.5 h-3.5" />Accept</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
