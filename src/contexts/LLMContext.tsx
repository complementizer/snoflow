import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef, useMemo } from 'react';
import { AnalysisResult, LinkedEntity, LLMProviderType } from '../types';
import { LLMProvider } from '../services/llm/types';
import { OpenAIProvider } from '../services/llm/openai';
import { AzureOpenAIProvider } from '../services/llm/azure';
import { loadConfig, saveConfig, AppConfig } from '../config';

export interface LLMSettings {
  provider: LLMProviderType;
  isConfigured: boolean;
  openaiKey: string;
  openaiModel: string;
  azureEndpoint: string;
  azureKey: string;
  azureDeployment: string;
  azureApiVersion: string;
}

interface BatchAnalysisState {
  isRunning: boolean;
  completed: number;
  total: number;
}

interface LLMContextType {
  settings: LLMSettings;
  updateSettings: (s: Partial<LLMSettings>) => void;
  provider: LLMProvider | null;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  analysisCache: Record<string, AnalysisResult>;
  cacheAnalysis: (entityKey: string, result: AnalysisResult) => void;
  getAnalysis: (entityKey: string) => AnalysisResult | null;
  clearAnalysisCache: () => void;
  batchAnalysis: BatchAnalysisState;
  analyzeAllEntities: (entities: LinkedEntity[], noteText: string, getEntityKey: (e: LinkedEntity) => string) => Promise<void>;
  cancelBatchAnalysis: () => void;
}

const LLMCtx = createContext<LLMContextType | null>(null);

function settingsFromConfig(config: AppConfig): LLMSettings {
  const isConfigured = config.llmProvider === 'openai'
    ? !!config.openai.apiKey
    : !!(config.azure.apiKey && config.azure.endpoint && config.azure.deploymentName);
  return {
    provider: config.llmProvider,
    isConfigured,
    openaiKey: config.openai.apiKey,
    openaiModel: config.openai.model,
    azureEndpoint: config.azure.endpoint,
    azureKey: config.azure.apiKey,
    azureDeployment: config.azure.deploymentName,
    azureApiVersion: config.azure.apiVersion,
  };
}

function createProvider(settings: LLMSettings): LLMProvider | null {
  if (!settings.isConfigured) return null;
  if (settings.provider === 'openai') {
    return new OpenAIProvider(settings.openaiKey, settings.openaiModel);
  }
  return new AzureOpenAIProvider(settings.azureEndpoint, settings.azureKey, settings.azureDeployment, settings.azureApiVersion);
}

export function LLMProvider_({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<LLMSettings>(() => settingsFromConfig(loadConfig()));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [analysisCache, setAnalysisCache] = useState<Record<string, AnalysisResult>>({});
  const [batchAnalysis, setBatchAnalysis] = useState<BatchAnalysisState>({ isRunning: false, completed: 0, total: 0 });
  const cancelBatchRef = useRef(false);

  const provider = useMemo(() => createProvider(settings), [settings]);

  useEffect(() => {
    const config = loadConfig();
    if (settings.provider === 'openai') {
      config.llmProvider = 'openai';
      config.openai = { apiKey: settings.openaiKey, model: settings.openaiModel };
    } else {
      config.llmProvider = 'azure-openai';
      config.azure = { endpoint: settings.azureEndpoint, apiKey: settings.azureKey, deploymentName: settings.azureDeployment, apiVersion: settings.azureApiVersion };
    }
    saveConfig(config);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<LLMSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...patch };
      updated.isConfigured = updated.provider === 'openai'
        ? !!updated.openaiKey
        : !!(updated.azureKey && updated.azureEndpoint && updated.azureDeployment);
      return updated;
    });
  }, []);

  const cacheAnalysis = useCallback((key: string, result: AnalysisResult) => {
    setAnalysisCache(prev => ({ ...prev, [key]: result }));
  }, []);

  const getAnalysis = useCallback((key: string): AnalysisResult | null => analysisCache[key] || null, [analysisCache]);
  const clearAnalysisCache = useCallback(() => setAnalysisCache({}), []);
  const cancelBatchAnalysis = useCallback(() => { cancelBatchRef.current = true; }, []);

  const analyzeAllEntities = useCallback(async (entities: LinkedEntity[], noteText: string, getEntityKey: (e: LinkedEntity) => string) => {
    if (!provider) return;
    const toAnalyze = entities.filter(e => !analysisCache[getEntityKey(e)]);
    if (toAnalyze.length === 0) return;

    cancelBatchRef.current = false;
    setBatchAnalysis({ isRunning: true, completed: 0, total: toAnalyze.length });

    for (let i = 0; i < toAnalyze.length; i++) {
      if (cancelBatchRef.current) break;
      const entity = toAnalyze[i];
      const entityKey = getEntityKey(entity);
      try {
        const result = await provider.analyzeEntity(entity, noteText);
        setAnalysisCache(prev => ({ ...prev, [entityKey]: result }));
      } catch (err) {
        setAnalysisCache(prev => ({
          ...prev,
          [entityKey]: { verdict: 'uncertain', recommendedConceptId: null, reasoning: '', keyFactors: [], error: err instanceof Error ? err.message : 'Analysis failed' },
        }));
      }
      setBatchAnalysis(prev => ({ ...prev, completed: i + 1 }));
    }
    setBatchAnalysis(prev => ({ ...prev, isRunning: false }));
  }, [provider, analysisCache]);

  return (
    <LLMCtx.Provider value={{
      settings, updateSettings, provider,
      isModalOpen, openModal: () => setIsModalOpen(true), closeModal: () => setIsModalOpen(false),
      analysisCache, cacheAnalysis, getAnalysis, clearAnalysisCache,
      batchAnalysis, analyzeAllEntities, cancelBatchAnalysis,
    }}>
      {children}
    </LLMCtx.Provider>
  );
}

export function useLLM() {
  const ctx = useContext(LLMCtx);
  if (!ctx) throw new Error('useLLM must be used within LLMProvider');
  return ctx;
}
