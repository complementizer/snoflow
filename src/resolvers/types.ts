import { EntityLinkingResponse, ConceptCandidate, HierarchyResponse, LinkedEntity, ChatMessage, AnalysisResult } from '../types';

export interface ExtractOptions {
  topK?: number;
  threshold?: number;
}

export interface ServiceHealth {
  name: string;
  ok: boolean;
  message: string;
}

export interface HealthStatus {
  ok: boolean;
  message: string;
  services: ServiceHealth[];
  llmModel?: string;
}

export interface ResolverCapabilities {
  supportsHierarchy: boolean;
  supportsConceptSearch: boolean;
  requiresLLM: boolean;
  supportsDiscussion: boolean;
  supportsAnalysis: boolean;
}

export interface EntityResolver {
  extractAndLink(text: string, options: ExtractOptions): Promise<EntityLinkingResponse>;
  searchConcepts(term: string, limit: number): Promise<ConceptCandidate[]>;
  getHierarchy(conceptId: string): Promise<HierarchyResponse | null>;
  checkHealth(): Promise<HealthStatus>;
  discuss?(messages: ChatMessage[], noteText: string, entities: LinkedEntity[], annotations: Record<string, string>): Promise<string>;
  analyzeEntity?(entity: LinkedEntity, noteText: string): Promise<AnalysisResult>;
  capabilities: ResolverCapabilities;
}
