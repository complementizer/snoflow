import { ResolverMode, LLMProviderType } from './types';

const STORAGE_KEY = 'snomed-annotator-config';

export interface AppConfig {
  resolverMode: ResolverMode;
  llmProvider: LLMProviderType;
  openai: {
    apiKey: string;
    model: string;
  };
  azure: {
    endpoint: string;
    apiKey: string;
    deploymentName: string;
    apiVersion: string;
  };
  customBackendUrl: string;
  snowstormUrl: string;
  setupComplete: boolean;
  autoAnalyze: boolean;
}

const DEFAULT_CONFIG: AppConfig = {
  resolverMode: 'snowstorm',
  llmProvider: 'openai',
  openai: {
    apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
    model: import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini',
  },
  azure: {
    endpoint: import.meta.env.VITE_AZURE_OPENAI_ENDPOINT || '',
    apiKey: import.meta.env.VITE_AZURE_OPENAI_API_KEY || '',
    deploymentName: import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT_NAME || '',
    apiVersion: import.meta.env.VITE_AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
  },
  customBackendUrl: import.meta.env.VITE_API_URL || 'http://localhost:8001',
  snowstormUrl: import.meta.env.VITE_SNOWSTORM_URL || 'https://browser.ihtsdotools.org/snowstorm/snomed-ct',
  setupComplete: false,
  autoAnalyze: true,
};

export function loadConfig(): AppConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isLLMConfigured(config: AppConfig): boolean {
  if (config.llmProvider === 'openai') {
    return !!config.openai.apiKey;
  }
  return !!config.azure.apiKey && !!config.azure.endpoint && !!config.azure.deploymentName;
}

export function needsLLM(mode: ResolverMode): boolean {
  return mode === 'snowstorm';
}
