import { EntityLinkingResponse, ConceptCandidate, HierarchyResponse, LinkedEntity, ChatMessage, AnalysisResult } from '../types';
import { SnowstormClient } from '../services/snowstorm';
import { LLMProvider } from '../services/llm/types';
import { EntityResolver, ExtractOptions, HealthStatus, ResolverCapabilities } from './types';

export class SnowstormResolver implements EntityResolver {
  private llm: LLMProvider;
  private snowstorm: SnowstormClient;

  capabilities: ResolverCapabilities = {
    supportsHierarchy: true,
    supportsConceptSearch: true,
    requiresLLM: true,
    supportsDiscussion: true,
    supportsAnalysis: true,
  };

  constructor(llm: LLMProvider, snowstorm: SnowstormClient) {
    this.llm = llm;
    this.snowstorm = snowstorm;
  }

  async extractAndLink(text: string, options: ExtractOptions = {}): Promise<EntityLinkingResponse> {
    const startTime = performance.now();
    const topK = options.topK || 5;
    const threshold = options.threshold || 0;

    const spans = await this.llm.extractEntities(text);

    const entities = await Promise.all(
      spans.map(async span => {
        const candidates = await this.snowstorm.searchDescriptions(span.mention, { limit: topK + 5 });

        let filtered = threshold > 0
          ? candidates.filter(c => c.score >= threshold)
          : candidates;
        filtered = filtered.slice(0, topK);

        return {
          mention: span.mention,
          entityType: span.entityType,
          start: span.start,
          end: span.end,
          candidates: filtered,
        };
      })
    );

    return {
      text,
      entities,
      processingTimeMs: performance.now() - startTime,
    };
  }

  async searchConcepts(term: string, limit: number): Promise<ConceptCandidate[]> {
    return this.snowstorm.searchDescriptions(term, { limit });
  }

  async getHierarchy(conceptId: string): Promise<HierarchyResponse | null> {
    return this.snowstorm.getHierarchy(conceptId);
  }

  async checkHealth(): Promise<HealthStatus> {
    const [llmOk, snowstormOk] = await Promise.all([
      this.llm.testConnection().catch(() => false),
      this.snowstorm.checkHealth().catch(() => false),
    ]);

    const services = [
      { name: 'LLM Backend', ok: llmOk, message: llmOk ? 'Connected' : 'Not reachable' },
      { name: 'Snowstorm', ok: snowstormOk, message: snowstormOk ? 'Connected' : 'Not reachable' },
    ];

    const allOk = llmOk && snowstormOk;
    return { ok: allOk, message: allOk ? 'All services ready' : 'Some services unavailable', services };
  }

  async discuss(messages: ChatMessage[], noteText: string, entities: LinkedEntity[], annotations: Record<string, string>): Promise<string> {
    return this.llm.chat(messages, noteText, entities, annotations);
  }

  async analyzeEntity(entity: LinkedEntity, noteText: string): Promise<AnalysisResult> {
    return this.llm.analyzeEntity(entity, noteText);
  }
}
