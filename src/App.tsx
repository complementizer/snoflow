import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { LinkedEntity, EntityLinkingResponse, HierarchyResponse, AnalysisResult, ChatMessage, ExplanationVerdict, NONE_MATCH } from './types';
import { AppConfig, loadConfig, saveConfig, needsLLM } from './config';
import { EntityResolver, ServiceHealth } from './resolvers/types';
import { SnowstormResolver } from './resolvers/snowstormResolver';
import { CustomBackendResolver } from './resolvers/customBackendResolver';
import { EntityText } from './components/EntityText';
import { SettingsBar } from './components/SettingsBar';
import { ProgressBar } from './components/ProgressBar';
import { MentionPanel } from './components/MentionPanel';
import { SuggestionsPanel } from './components/SuggestionsPanel';
import { ChatPanel } from './components/ChatPanel';
import { ProviderSettings } from './components/ProviderSettings';
import { SetupWizard } from './components/SetupWizard';
import { LLMProvider_, useLLM } from './contexts/LLMContext';
import { SHORT_EXAMPLES, FULL_NOTE_EXAMPLES } from './services/examples';
import { exportAnnotations, downloadJson } from './utils/export';
import { OpenAIProvider } from './services/llm/openai';
import { AzureOpenAIProvider } from './services/llm/azure';
import { SnowstormClient } from './services/snowstorm';
import { Loader2, Search, Download, CheckCheck, AlertCircle, Sparkles, Settings, Server, Check, XCircle } from 'lucide-react';
import { BackendRequestEvent } from './resolvers/customBackendResolver';

type ResolverStatus = 'checking' | 'ready' | 'error';

interface BackendStep {
  step: string;
  method: string;
  endpoint: string;
  status: 'pending' | 'done' | 'error';
  durationMs?: number;
}

function LLMSettingsButton() {
  const { settings, openModal } = useLLM();
  return (
    <button
      onClick={openModal}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        settings.isConfigured
          ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
          : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
      }`}
      title="Configure LLM settings"
    >
      <Sparkles className="w-3.5 h-3.5" />
      {settings.isConfigured ? 'AI Ready (browser)' : 'Configure AI'}
    </button>
  );
}

function createResolver(config: AppConfig): EntityResolver | null {
  try {
    if (config.resolverMode === 'snowstorm') {
      const llmProvider = config.llmProvider === 'openai'
        ? new OpenAIProvider(config.openai.apiKey, config.openai.model)
        : new AzureOpenAIProvider(config.azure.endpoint, config.azure.apiKey, config.azure.deploymentName, config.azure.apiVersion);
      return new SnowstormResolver(llmProvider, new SnowstormClient(config.snowstormUrl));
    }
    if (config.resolverMode === 'custom-backend') {
      return new CustomBackendResolver(config.customBackendUrl);
    }
  } catch {
    return null;
  }
  return null;
}

function BackendStepsDisplay({ steps }: { steps: BackendStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          {s.status === 'pending' && <Loader2 className="w-4 h-4 text-teal-500 animate-spin flex-shrink-0" />}
          {s.status === 'done' && <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
          {s.status === 'error' && <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />}
          <span className={s.status === 'pending' ? 'text-slate-700 font-medium' : 'text-slate-500'}>
            {s.step}
          </span>
          <code className="text-xs text-slate-400">{s.method} {s.endpoint}</code>
          {s.durationMs != null && <span className="text-xs text-slate-400">({s.durationMs.toFixed(0)}ms)</span>}
        </div>
      ))}
    </div>
  );
}

function BackendActivityIndicator({ steps }: { steps: BackendStep[] }) {
  const active = steps.find(s => s.status === 'pending');
  if (!active) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg animate-pulse">
      <Server className="w-3.5 h-3.5" />
      <span>{active.step}: {active.method} {active.endpoint}</span>
      <Loader2 className="w-3 h-3 animate-spin" />
    </div>
  );
}

function AppContent() {
  const { clearAnalysisCache, settings, analyzeAllEntities, batchAnalysis, cancelBatchAnalysis, analysisCache, cacheAnalysis } = useLLM();
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  const [showWizard, setShowWizard] = useState(!config.setupComplete);

  const resolver = useMemo(() => createResolver(config), [config]);
  const resolverRef = useRef(resolver);
  resolverRef.current = resolver;

  const [backendSteps, setBackendSteps] = useState<BackendStep[]>([]);

  useEffect(() => {
    if (resolver instanceof CustomBackendResolver) {
      return resolver.onRequest((event: BackendRequestEvent) => {
        const stepLabel = event.step || `${event.method} ${event.endpoint}`;
        setBackendSteps(prev => {
          const existing = prev.findIndex(s => s.step === stepLabel);
          const entry: BackendStep = {
            step: stepLabel,
            method: event.method,
            endpoint: event.endpoint,
            status: event.status,
            durationMs: event.durationMs,
          };
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = entry;
            return next;
          }
          return [...prev, entry];
        });
      });
    }
  }, [resolver]);

  const [resolverStatus, setResolverStatus] = useState<ResolverStatus>('checking');
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth[]>([]);
  const [backendLlmModel, setBackendLlmModel] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<EntityLinkingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Record<string, string>>({});
  const [topK, setTopK] = useState(5);
  const [threshold, setThreshold] = useState(0.5);
  const [activeEntityKey, setActiveEntityKey] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(true);
  const [mentionPanelWidth, setMentionPanelWidth] = useState(0);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  const getEntityKey = (entity: LinkedEntity) =>
    `${entity.start}_${entity.end}_${entity.mention}`;

  useEffect(() => {
    if (!resolver) {
      setResolverStatus('error');
      setServiceHealth([]);
      return;
    }
    let cancelled = false;
    const check = async () => {
      setResolverStatus('checking');
      setServiceHealth([]);
      try {
        const health = await resolver.checkHealth();
        if (!cancelled) {
          setResolverStatus(health.ok ? 'ready' : 'error');
          setServiceHealth(health.services);
          setBackendLlmModel(health.llmModel ?? null);
        }
      } catch {
        if (!cancelled) {
          setResolverStatus('error');
          setServiceHealth([]);
        }
      }
    };
    check();
    return () => { cancelled = true; };
  }, [resolver]);

  const sortedEntities = result?.entities
    ? [...result.entities].sort((a, b) => {
        const aKey = getEntityKey(a);
        const bKey = getEntityKey(b);
        const aNone = annotations[aKey] === NONE_MATCH ? 0 : 1;
        const bNone = annotations[bKey] === NONE_MATCH ? 0 : 1;
        if (aNone !== bNone) return aNone - bNone;
        return (a.candidates[0]?.score ?? 0) - (b.candidates[0]?.score ?? 0);
      })
    : [];

  const findNextUnreviewed = useCallback((currentKey: string | null) => {
    if (!result) return null;
    const currentIdx = sortedEntities.findIndex(e => getEntityKey(e) === currentKey);
    for (let i = currentIdx + 1; i < sortedEntities.length; i++) {
      const key = getEntityKey(sortedEntities[i]);
      if (!confirmed.has(key)) return key;
    }
    for (let i = 0; i < currentIdx; i++) {
      const key = getEntityKey(sortedEntities[i]);
      if (!confirmed.has(key)) return key;
    }
    return null;
  }, [result, sortedEntities, confirmed]);

  const isCustomBackend = config.resolverMode === 'custom-backend';

  const [analyzeStep, setAnalyzeStep] = useState<{ current: number; total: number } | null>(null);

  const handleProcess = useCallback(async () => {
    if (!resolver) return;
    setIsLoading(true);
    setError(null);
    setActiveEntityKey(null);
    setAnnotations({});
    setConfirmed(new Set());
    clearAnalysisCache();
    setShowInput(false);
    setBackendSteps([]);
    setAnalyzeStep(null);

    try {
      const response = await resolver.extractAndLink(inputText, { topK, threshold });

      const analyze = config.autoAnalyze && (resolverRef.current?.capabilities.supportsAnalysis);
      if (analyze && response.entities.length > 0) {
        const needsAnalysis = response.entities.filter(e => !e.verdict);
        if (needsAnalysis.length > 0) {
          setAnalyzeStep({ current: 0, total: needsAnalysis.length });
          for (let i = 0; i < needsAnalysis.length; i++) {
            const entity = needsAnalysis[i];
            const entityKey = getEntityKey(entity);
            try {
              const analysisResult = await resolver.analyzeEntity!(entity, response.text);
              cacheAnalysis(entityKey, analysisResult);
              entity.verdict = analysisResult.verdict;
              entity.recommendedConceptId = analysisResult.recommendedConceptId ?? entity.recommendedConceptId;
              entity.explanation = analysisResult.reasoning;
              entity.keyFactors = analysisResult.keyFactors;
              entity.ambiguityNote = analysisResult.ambiguityNote;
              entity.alternativeConsiderations = analysisResult.alternativeConsiderations;
            } catch (err) {
              const fallback: AnalysisResult = {
                verdict: 'uncertain',
                recommendedConceptId: null,
                reasoning: '',
                keyFactors: [],
                error: err instanceof Error ? err.message : 'Analysis failed',
              };
              cacheAnalysis(entityKey, fallback);
              entity.verdict = 'uncertain';
            }
            setAnalyzeStep({ current: i + 1, total: needsAnalysis.length });
          }
        }
      }

      setResult(response);

      if (response.entities.length > 0) {
        const autoAnnotations: Record<string, string> = {};
        for (const entity of response.entities) {
          const key = getEntityKey(entity);
          if (entity.recommendedConceptId) {
            autoAnnotations[key] = entity.recommendedConceptId;
          } else if (entity.candidates[0]) {
            autoAnnotations[key] = entity.candidates[0].conceptId;
          }
        }
        if (Object.keys(autoAnnotations).length > 0) {
          setAnnotations(autoAnnotations);
        }

        const sorted = [...response.entities].sort((a, b) => {
          const aKey = getEntityKey(a);
          const bKey = getEntityKey(b);
          const aNone = autoAnnotations[aKey] === NONE_MATCH ? 0 : 1;
          const bNone = autoAnnotations[bKey] === NONE_MATCH ? 0 : 1;
          if (aNone !== bNone) return aNone - bNone;
          return (a.candidates[0]?.score ?? 0) - (b.candidates[0]?.score ?? 0);
        });
        setActiveEntityKey(getEntityKey(sorted[0]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setShowInput(true);
    } finally {
      setIsLoading(false);
      setAnalyzeStep(null);
    }
  }, [inputText, topK, threshold, clearAnalysisCache, resolver, config.autoAnalyze, cacheAnalysis]);

  const handleConceptSelect = useCallback((entityKey: string, conceptId: string) => {
    setAnnotations(prev => ({ ...prev, [entityKey]: conceptId }));
    setConfirmed(prev => new Set(prev).add(entityKey));

    setResult(prev => {
      if (!prev) return prev;
      const entity = prev.entities.find(e => getEntityKey(e) === entityKey);
      if (!entity) return prev;
      if (entity.candidates.some(c => c.conceptId === conceptId)) return prev;
      const manualCandidate: LinkedEntity['candidates'][number] = {
        conceptId,
        term: conceptId,
        fsn: conceptId,
        semanticTag: 'manual entry',
        score: 0,
        manual: true,
      };
      return {
        ...prev,
        entities: prev.entities.map(e =>
          getEntityKey(e) === entityKey
            ? { ...e, candidates: [...e.candidates, manualCandidate] }
            : e
        ),
      };
    });

    const next = findNextUnreviewed(entityKey);
    if (next) setTimeout(() => setActiveEntityKey(next), 150);
    else setActiveEntityKey(null);
  }, [findNextUnreviewed]);

  const handleEntityCreate = useCallback((start: number, end: number) => {
    setResult(prev => {
      if (!prev) return prev;
      if (prev.entities.some(e => start < e.end && end > e.start)) return prev;
      const mention = prev.text.slice(start, end);
      const newEntity: LinkedEntity = {
        mention,
        entityType: 'unknown',
        start,
        end,
        candidates: [],
      };
      return { ...prev, entities: [...prev.entities, newEntity] };
    });
    const mention = result?.text.slice(start, end) ?? '';
    setActiveEntityKey(`${start}_${end}_${mention}`);
  }, [result]);

  const handleEntityDelete = useCallback((key: string) => {
    setResult(prev => prev ? { ...prev, entities: prev.entities.filter(e => getEntityKey(e) !== key) } : prev);
    setAnnotations(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setActiveEntityKey(curr => (curr === key ? null : curr));
  }, []);

  const handleEntityFetchCandidates = useCallback(async (key: string) => {
    if (!resolverRef.current) return;
    if (!resolverRef.current.capabilities.supportsConceptSearch) return;
    const entity = result?.entities.find(e => getEntityKey(e) === key);
    if (!entity) return;
    const candidates = await resolverRef.current.searchConcepts(entity.mention, topK);
    setResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        entities: prev.entities.map(e =>
          getEntityKey(e) === key ? { ...e, candidates } : e
        ),
      };
    });
  }, [result, topK]);

  const handleEntityResize = useCallback((key: string, newStart: number, newEnd: number) => {
    setResult(prev => {
      if (!prev) return prev;
      const entity = prev.entities.find(e => getEntityKey(e) === key);
      if (!entity) return prev;
      const newMention = prev.text.slice(newStart, newEnd);
      const updated: LinkedEntity = { ...entity, start: newStart, end: newEnd, mention: newMention };
      return { ...prev, entities: prev.entities.map(e => (getEntityKey(e) === key ? updated : e)) };
    });
    setAnnotations(prev => {
      if (!(key in prev)) return prev;
      const newMention = result?.text.slice(newStart, newEnd) ?? '';
      const newKey = `${newStart}_${newEnd}_${newMention}`;
      const next = { ...prev };
      next[newKey] = next[key];
      delete next[key];
      return next;
    });
    setActiveEntityKey(curr => {
      if (curr !== key) return curr;
      const newMention = result?.text.slice(newStart, newEnd) ?? '';
      return `${newStart}_${newEnd}_${newMention}`;
    });
  }, [result]);

  const handleAcceptAll = useCallback(() => {
    if (!result) return;
    const newAnnotations: Record<string, string> = {};
    const newConfirmed = new Set(confirmed);
    result.entities.forEach(entity => {
      const key = getEntityKey(entity);
      if (!annotations[key] && entity.candidates[0]) {
        newAnnotations[key] = entity.candidates[0].conceptId;
      }
      newConfirmed.add(key);
    });
    setAnnotations(prev => ({ ...prev, ...newAnnotations }));
    setConfirmed(newConfirmed);
    setActiveEntityKey(null);
  }, [result, annotations, confirmed]);

  const handleExport = useCallback(() => {
    if (!result) return;
    const exportData = exportAnnotations(result.text, result.entities, annotations, confirmed, getEntityKey);
    downloadJson(exportData);
  }, [result, annotations, confirmed]);

  const activeEntity = activeEntityKey
    ? result?.entities.find(e => getEntityKey(e) === activeEntityKey) || null
    : null;

  const activeEntityIndex = activeEntityKey
    ? sortedEntities.findIndex(e => getEntityKey(e) === activeEntityKey)
    : -1;

  const handleNextEntity = useCallback(() => {
    if (activeEntityIndex < sortedEntities.length - 1) {
      setActiveEntityKey(getEntityKey(sortedEntities[activeEntityIndex + 1]));
    }
  }, [activeEntityIndex, sortedEntities]);

  const handlePreviousEntity = useCallback(() => {
    if (activeEntityIndex > 0) {
      setActiveEntityKey(getEntityKey(sortedEntities[activeEntityIndex - 1]));
    }
  }, [activeEntityIndex, sortedEntities]);

  const fetchHierarchy = useCallback(async (conceptId: string): Promise<HierarchyResponse | null> => {
    if (!resolverRef.current) return null;
    return resolverRef.current.getHierarchy(conceptId);
  }, []);

  const resolverDiscuss = useMemo(() => {
    if (!resolver?.discuss || !resolver.capabilities.supportsDiscussion) return undefined;
    return (messages: ChatMessage[], noteText: string, entities: LinkedEntity[], anns: Record<string, string>) =>
      resolver.discuss!(messages, noteText, entities, anns);
  }, [resolver]);

  const resolverAnalyze = useMemo(() => {
    if (!resolver?.analyzeEntity || !resolver.capabilities.supportsAnalysis) return undefined;
    return (entity: LinkedEntity, noteText: string): Promise<AnalysisResult> =>
      resolver.analyzeEntity!(entity, noteText);
  }, [resolver]);

  const handleAnalyzeAll = useCallback(() => {
    if (!result) return;
    if (resolverAnalyze) {
      const toAnalyze = result.entities.filter(e => !analysisCache[getEntityKey(e)]);
      if (toAnalyze.length === 0) return;

      (async () => {
        for (const entity of toAnalyze) {
          const entityKey = getEntityKey(entity);
          try {
            const analysisResult = await resolverAnalyze(entity, result.text);
            cacheAnalysis(entityKey, analysisResult);
          } catch (err) {
            cacheAnalysis(entityKey, {
              verdict: 'uncertain',
              recommendedConceptId: null,
              reasoning: '',
              keyFactors: [],
              error: err instanceof Error ? err.message : 'Analysis failed',
            });
          }
        }
      })();
    } else {
      analyzeAllEntities(result.entities, result.text, getEntityKey);
    }
  }, [result, resolverAnalyze, analysisCache, analyzeAllEntities, cacheAnalysis]);

  const handleSetupComplete = (newConfig: AppConfig) => {
    setConfig(newConfig);
    setShowWizard(false);
  };

  const handleReconfigure = () => {
    setShowWizard(true);
  };

  const reviewedCount = confirmed.size;
  const totalCount = result?.entities.length ?? 0;
  const supportsHierarchy = resolver?.capabilities.supportsHierarchy ?? false;

  const certaintyMap = useMemo(() => {
    const map: Record<string, ExplanationVerdict> = {};
    if (!result) return map;
    for (const entity of result.entities) {
      const key = getEntityKey(entity);
      const cached = analysisCache[key];
      if (cached?.verdict) {
        map[key] = cached.verdict;
      } else if (entity.verdict) {
        map[key] = entity.verdict;
      }
    }
    return map;
  }, [result, analysisCache]);

  const canAnalyzeAll = isCustomBackend
    ? !!resolverAnalyze
    : settings.isConfigured;

  if (showWizard) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  const modeLabel = config.resolverMode === 'snowstorm'
    ? 'Snowstorm'
    : 'Custom Backend';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <img src="/snoflow-logo.png" alt="SNOFlow" className="h-14 w-auto" />
              <div className="h-10 w-px bg-slate-200" />
              <h1 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 leading-tight max-w-[8rem]">
                SNOMED CT<br />Annotator
              </h1>
            </div>
            <div className="pl-3 border-l border-slate-200 flex items-center gap-3">
              {resolverStatus === 'checking' ? (
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Connecting...
                </span>
              ) : serviceHealth.length > 0 ? (
                serviceHealth.map(svc => (
                  <span
                    key={svc.name}
                    className={`flex items-center gap-1.5 text-xs ${svc.ok ? 'text-emerald-600' : 'text-rose-600'}`}
                    title={svc.message}
                  >
                    {svc.ok
                      ? <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                      : <AlertCircle className="w-3 h-3" />}
                    {svc.name}
                  </span>
                ))
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-rose-600">
                  <AlertCircle className="w-3 h-3" />
                  {modeLabel}
                </span>
              )}
            </div>
            {needsLLM(config.resolverMode) && (
              <div className="pl-3 border-l border-slate-200">
                <LLMSettingsButton />
              </div>
            )}
            {isCustomBackend && (
              <div className="pl-3 border-l border-slate-200">
                <BackendActivityIndicator steps={backendSteps} />
              </div>
            )}
            <div className="pl-3 border-l border-slate-200">
              <button
                onClick={handleReconfigure}
                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title="Reconfigure setup"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main
        className="max-w-5xl mx-auto px-6 py-8 transition-all"
        style={{ marginRight: mentionPanelWidth > 0 ? mentionPanelWidth : undefined }}
      >
        <SettingsBar
          topK={topK}
          setTopK={setTopK}
          threshold={threshold}
          setThreshold={setThreshold}
          autoAnalyze={config.autoAnalyze}
          setAutoAnalyze={(v) => {
            const updated = { ...config, autoAnalyze: v };
            setConfig(updated);
            saveConfig(updated);
          }}
          shortExamples={SHORT_EXAMPLES}
          fullNotes={FULL_NOTE_EXAMPLES}
          onExampleSelect={(text) => {
            setInputText(text);
            setResult(null);
            setError(null);
            setShowInput(true);
          }}
        />

        {error && (
          <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-rose-800">Error</p>
              <p className="text-sm text-rose-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {showInput && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="mb-3">
              <label htmlFor="clinical-text" className="block text-sm font-medium text-slate-700 mb-1">Clinical Text</label>
              <p className="text-xs text-slate-500">
                Paste or type any clinical note, discharge summary, or medical text below.
                Or select an example from the <strong>Examples</strong> dropdown above.
              </p>
            </div>
            <textarea
              id="clinical-text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={"Paste your clinical text here...\n\nExamples:\n• Discharge summaries\n• Progress notes\n• Radiology reports\n• Pathology reports"}
              className="w-full h-48 p-4 text-base border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono"
              autoFocus
            />
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleProcess}
                disabled={isLoading || !inputText.trim() || resolverStatus === 'error'}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Processing...</>
                ) : (
                  <><Search className="w-5 h-5" />Extract Entities</>
                )}
              </button>
              {inputText.trim() && (
                <button
                  onClick={() => setInputText('')}
                  className="px-4 py-3 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {isLoading && !showInput && (
          <div className="mt-6 flex flex-col items-center justify-center py-16">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-2">
              {analyzeStep
                ? `Analyzing entities... (${analyzeStep.current}/${analyzeStep.total})`
                : isCustomBackend ? 'Processing via backend...' : 'Extracting entities...'}
            </h3>
            {isCustomBackend && backendSteps.length > 0 ? (
              <div className="mt-3 bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-w-[320px]">
                <BackendStepsDisplay steps={backendSteps} />
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center max-w-md">
                {analyzeStep
                  ? 'Running LLM analysis on each entity to determine certainty.'
                  : 'Identifying medical terms and linking them to SNOMED CT concepts.'}
              </p>
            )}
          </div>
        )}

        {result && !showInput && !isLoading && (
          <div className="mt-6">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm text-slate-500">
                Click highlighted entities to review and confirm their SNOMED CT mappings.
              </p>
              <button onClick={() => setShowInput(true)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                Edit text
              </button>
            </div>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 p-2 pl-3 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <ProgressBar reviewed={reviewedCount} total={totalCount} />
                <div className="h-6 w-px bg-slate-200" />
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1 cursor-help" title="Top choice is correct"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300" />Confident</span>
                  <span className="flex items-center gap-1 cursor-help" title="Top choice is probably correct"><span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300" />Likely</span>
                  <span className="flex items-center gap-1 cursor-help" title="Ambiguous or insufficient context"><span className="w-2.5 h-2.5 rounded bg-rose-100 border border-rose-300" />Uncertain</span>
                  <span className="flex items-center gap-1 cursor-help" title="No candidate is correct"><span className="w-2.5 h-2.5 rounded bg-violet-100 border border-violet-300" />No match</span>
                  <span className="flex items-center gap-1 cursor-help" title="Not yet analyzed by LLM"><span className="w-2.5 h-2.5 rounded bg-slate-100 border border-slate-300" />Pending</span>
                  <span className="flex items-center gap-1 cursor-help" title="Manually reviewed"><Check className="w-2.5 h-2.5 text-emerald-600" />Confirmed</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {canAnalyzeAll && (
                  batchAnalysis.isRunning ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{batchAnalysis.completed}/{batchAnalysis.total}</span>
                      <button onClick={cancelBatchAnalysis} className="ml-1 text-indigo-500 hover:text-indigo-700" title="Cancel">&times;</button>
                    </div>
                  ) : (
                    <button
                      onClick={handleAnalyzeAll}
                      disabled={Object.keys(analysisCache).length === result.entities.length}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                      title="Run AI analysis on all mentions"
                    >
                      <Sparkles className="w-4 h-4" />AI Analyze All
                      {isCustomBackend && (
                        <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] text-teal-600">
                          <Server className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </button>
                  )
                )}

                <button
                  onClick={handleAcceptAll}
                  disabled={reviewedCount === totalCount}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <CheckCheck className="w-4 h-4" />Accept All
                </button>

                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />Export
                </button>
              </div>
            </div>

            <EntityText
              text={result.text}
              entities={result.entities}
              annotations={annotations}
              confirmed={confirmed}
              activeEntityKey={activeEntityKey}
              onEntityClick={setActiveEntityKey}
              certaintyMap={certaintyMap}
              onEntityCreate={handleEntityCreate}
              onEntityDelete={handleEntityDelete}
              onEntityResize={handleEntityResize}
            />

            <p className="mt-2 text-xs text-slate-400">
              Tip: select text to tag a new entity · click an entity to reveal resize handles and a remove button.
            </p>

            <div className="mt-6 flex gap-6 text-sm text-slate-500">
              <span>{result.processingTimeMs.toFixed(0)}ms</span>
              <span>{result.entities.length} entities</span>
              <span>{reviewedCount} reviewed</span>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SuggestionsPanel
                entities={result.entities}
                annotations={annotations}
                confirmed={confirmed}
                onEntityClick={setActiveEntityKey}
                getEntityKey={getEntityKey}
                certaintyMap={certaintyMap}
              />
              <ChatPanel
                noteText={result.text}
                entities={result.entities}
                annotations={annotations}
                onChat={resolverDiscuss}
              />
            </div>
          </div>
        )}

        {!result && !showInput && (
          <div className="mt-12 text-center text-slate-500">
            <p>Enter clinical text to extract entities</p>
          </div>
        )}
      </main>

      <MentionPanel
        entity={activeEntity}
        entityKey={activeEntityKey}
        noteText={result?.text || ''}
        annotation={activeEntityKey ? annotations[activeEntityKey] : undefined}
        onSelect={(conceptId) => activeEntityKey && handleConceptSelect(activeEntityKey, conceptId)}
        onDelete={() => activeEntityKey && handleEntityDelete(activeEntityKey)}
        onClose={() => setActiveEntityKey(null)}
        onNext={handleNextEntity}
        onPrevious={handlePreviousEntity}
        hasNext={activeEntityIndex < sortedEntities.length - 1}
        hasPrevious={activeEntityIndex > 0}
        currentIndex={activeEntityIndex}
        totalCount={sortedEntities.length}
        onWidthChange={setMentionPanelWidth}
        supportsHierarchy={supportsHierarchy}
        fetchHierarchy={fetchHierarchy}
        supportsConceptSearch={resolver?.capabilities.supportsConceptSearch ?? false}
        onFetchCandidates={handleEntityFetchCandidates}
        onAnalyzeEntity={resolverAnalyze}
        backendLlmModel={backendLlmModel}
      />

      <footer
        className="fixed bottom-0 left-0 bg-white border-t border-slate-200 py-2 text-center text-xs text-slate-400 transition-all"
        style={{ right: mentionPanelWidth > 0 ? mentionPanelWidth : 0 }}
      >
        SNOMED CT Annotator &middot; {modeLabel} mode
      </footer>

      <ProviderSettings />
    </div>
  );
}

export default function App() {
  return (
    <LLMProvider_>
      <AppContent />
    </LLMProvider_>
  );
}
