import { EntityLinkingResponse, ConceptCandidate, HierarchyResponse, ConceptInfo, LinkedEntity, ExplanationVerdict, ChatMessage, AnalysisResult } from '../types';
import { EntityResolver, ExtractOptions, HealthStatus, ResolverCapabilities } from './types';

interface ApiCandidate {
  concept_id: string;
  score: number;
  term: string;
  fsn: string;
  semantic_tag: string | null;
}

interface ApiEntity {
  mention: string;
  type: string;
  start: number;
  end: number;
  candidates: ApiCandidate[];
}

interface ApiResponse {
  entities: ApiEntity[];
  text: string;
  processing_time_ms: number;
}

interface ApiAlternativeConsideration {
  concept_id: string;
  reason: string;
}

interface ApiLinkedEntity {
  mention: string;
  entity_type: string;
  start: number;
  end: number;
  candidates: ApiCandidate[];
  explanation?: string;
  verdict?: string;
  recommended_concept_id?: string | null;
  key_factors?: string[];
  ambiguity_note?: string;
  alternative_considerations?: ApiAlternativeConsideration[];
}

interface ApiLinkingResponse {
  entities: ApiLinkedEntity[];
  text: string;
  processing_time_ms: number;
}

interface ApiHierarchyResponse {
  concept: { concept_id: string; term: string; fsn: string };
  parents: Array<{ concept_id: string; term: string; fsn: string }>;
  children: Array<{ concept_id: string; term: string; fsn: string }>;
  children_truncated: boolean;
  relationships: Array<{ type: string; type_id: string; target: { concept_id: string; term: string; fsn: string } }>;
}

interface ApiDiscussionResponse {
  response: string;
  processing_time_ms: number;
}

function mapCandidate(c: ApiCandidate): ConceptCandidate {
  return {
    conceptId: c.concept_id,
    score: c.score,
    term: c.term,
    fsn: c.fsn,
    semanticTag: c.semantic_tag || 'unknown',
  };
}

function mapConceptInfo(c: { concept_id: string; term: string; fsn: string }): ConceptInfo {
  return { conceptId: c.concept_id, term: c.term, fsn: c.fsn };
}

function mapLinkedEntity(e: ApiLinkedEntity): LinkedEntity {
  const mapped: LinkedEntity = {
    mention: e.mention,
    entityType: e.entity_type,
    start: e.start,
    end: e.end,
    candidates: e.candidates.map(mapCandidate),
    explanation: e.explanation,
    verdict: e.verdict as ExplanationVerdict | undefined,
    recommendedConceptId: e.recommended_concept_id,
    keyFactors: e.key_factors,
    ambiguityNote: e.ambiguity_note,
    alternativeConsiderations: e.alternative_considerations?.map(a => ({
      conceptId: a.concept_id,
      reason: a.reason,
    })),
    linkedViaBackend: true,
  };
  console.log(`[snoflow] Linked entity "${e.mention}":`, {
    explanation: mapped.explanation,
    verdict: mapped.verdict,
    recommendedConceptId: mapped.recommendedConceptId,
    linkedViaBackend: mapped.linkedViaBackend,
  });
  return mapped;
}

export interface BackendRequestEvent {
  method: string;
  endpoint: string;
  status: 'pending' | 'done' | 'error';
  durationMs?: number;
  step?: string;
}

type RequestListener = (event: BackendRequestEvent) => void;

export class CustomBackendResolver implements EntityResolver {
  private baseUrl: string;
  private listeners: RequestListener[] = [];

  capabilities: ResolverCapabilities = {
    supportsHierarchy: true,
    supportsConceptSearch: false,
    requiresLLM: false,
    supportsDiscussion: true,
    supportsAnalysis: true,
  };

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  onRequest(listener: RequestListener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private notify(event: Parameters<RequestListener>[0]) {
    this.listeners.forEach(l => l(event));
  }

  private async trackedFetch(method: string, endpoint: string, init?: RequestInit, step?: string): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const start = performance.now();
    const stepPrefix = step ? `[${step}] ` : '';
    console.log(`[snoflow] ${stepPrefix}--> ${method} ${endpoint}`);
    this.notify({ method, endpoint, status: 'pending', step });

    try {
      const response = await fetch(url, { method, ...init });
      const durationMs = performance.now() - start;
      console.log(`[snoflow] ${stepPrefix}<-- ${method} ${endpoint} ${response.status} (${durationMs.toFixed(0)}ms)`);
      this.notify({ method, endpoint, status: response.ok ? 'done' : 'error', durationMs, step });
      return response;
    } catch (err) {
      const durationMs = performance.now() - start;
      console.error(`[snoflow] ${stepPrefix}<-- ${method} ${endpoint} FAILED (${durationMs.toFixed(0)}ms)`, err);
      this.notify({ method, endpoint, status: 'error', durationMs, step });
      throw err;
    }
  }

  async extractAndLink(text: string, options: ExtractOptions = {}): Promise<EntityLinkingResponse> {
    const startTime = performance.now();
    const topK = options.topK || 5;

    const extractResponse = await this.trackedFetch('POST', '/api/v1/extract', {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ text, top_k: topK }),
    }, 'Step 1/2: Extracting clinical entities (NER) + candidate retrieval');

    if (!extractResponse.ok) {
      if (extractResponse.status === 503) throw new Error('Backend is starting up. Please wait for models to load.');
      throw new Error(`Backend error: ${await extractResponse.text()}`);
    }

    const extractData: ApiResponse = await extractResponse.json();

    const threshold = options.threshold || 0;
    let extractedEntities = extractData.entities;
    if (threshold > 0) {
      extractedEntities = extractedEntities
        .map(e => ({ ...e, candidates: e.candidates.filter(c => c.score >= threshold) }))
        .filter(e => e.candidates.length > 0);
    }

    if (extractedEntities.length === 0) {
      return {
        text: extractData.text,
        entities: [],
        processingTimeMs: performance.now() - startTime,
      };
    }

    const linkingPayload = {
      text: extractData.text,
      entities: extractedEntities.map(e => ({
        mention: e.mention,
        entity_type: e.type,
        start: e.start,
        end: e.end,
        candidates: e.candidates,
      })),
    };

    let linkingError: string | undefined;

    try {
      const linkingResponse = await this.trackedFetch('POST', '/api/v1/linking', {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(linkingPayload),
      }, 'Step 2/2: Entity linking — disambiguating to SNOMED CT');

      if (linkingResponse.ok) {
        const linkingData: ApiLinkingResponse = await linkingResponse.json();
        return {
          text: linkingData.text,
          entities: linkingData.entities.map(mapLinkedEntity),
          processingTimeMs: performance.now() - startTime,
        };
      } else {
        const errorText = await linkingResponse.text();
        try {
          const errorJson = JSON.parse(errorText);
          linkingError = errorJson.detail || errorText;
        } catch {
          linkingError = errorText;
        }
      }
    } catch (err) {
      linkingError = err instanceof Error ? err.message : 'Linking request failed';
    }

    return {
      text: extractData.text,
      entities: extractedEntities.map(e => ({
        mention: e.mention,
        entityType: e.type,
        start: e.start,
        end: e.end,
        candidates: e.candidates.map(mapCandidate),
        linkingError,
      })),
      processingTimeMs: performance.now() - startTime,
    };
  }

  async searchConcepts(_term: string, _limit: number): Promise<ConceptCandidate[]> {
    return [];
  }

  async getHierarchy(conceptId: string): Promise<HierarchyResponse | null> {
    try {
      const response = await this.trackedFetch('GET', `/api/v1/concepts/${conceptId}/hierarchy`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) return null;

      const data: ApiHierarchyResponse = await response.json();
      return {
        concept: mapConceptInfo(data.concept),
        parents: data.parents.map(mapConceptInfo),
        children: data.children.map(mapConceptInfo),
        childrenTruncated: data.children_truncated,
        relationships: data.relationships.map(r => ({
          type: r.type,
          typeId: r.type_id,
          target: mapConceptInfo(r.target),
        })),
      };
    } catch {
      return null;
    }
  }

  async checkHealth(): Promise<HealthStatus> {
    try {
      const response = await this.trackedFetch('GET', '/health', {
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) {
        return { ok: false, message: 'Backend not reachable', services: [{ name: 'Backend', ok: false, message: 'Not reachable' }] };
      }
      const data = await response.json();
      if (data.status === 'healthy' && data.models_loaded) {
        return { ok: true, message: 'Backend ready', services: [{ name: 'Backend', ok: true, message: 'Connected' }], llmModel: data.llm_model };
      }
      return { ok: false, message: 'Backend starting up...', services: [{ name: 'Backend', ok: false, message: 'Starting up...' }] };
    } catch {
      return { ok: false, message: 'Backend offline', services: [{ name: 'Backend', ok: false, message: 'Offline' }] };
    }
  }

  async discuss(messages: ChatMessage[], noteText: string, entities: LinkedEntity[], annotations: Record<string, string>): Promise<string> {
    const entitiesSummary = entities.map(e => {
      const key = `${e.start}_${e.end}_${e.mention}`;
      const annotation = annotations[key];
      const status = annotation
        ? (annotation === '__NOT_LINKED__' ? 'marked as not linked' : `selected: ${annotation}`)
        : 'pending review';
      const topCandidates = e.candidates.slice(0, 3)
        .map(c => `${c.term} (${c.conceptId}, ${(c.score * 100).toFixed(1)}%)`)
        .join(', ');
      return `- "${e.mention}" [${e.entityType}]: ${status}. Candidates: ${topCandidates}`;
    }).join('\n');

    const enrichedText = `${noteText}\n\n**Extracted Entities (${entities.length} total):**\n${entitiesSummary}`;

    const response = await this.trackedFetch('POST', '/api/v1/discussion', {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        text: enrichedText,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Discussion failed: ${errorText}`);
    }

    const data: ApiDiscussionResponse = await response.json();
    return data.response;
  }

  async analyzeEntity(entity: LinkedEntity, noteText: string): Promise<AnalysisResult> {
    const payload = {
      text: noteText,
      entities: [{
        mention: entity.mention,
        entity_type: entity.entityType,
        start: entity.start,
        end: entity.end,
        candidates: entity.candidates.map(c => ({
          concept_id: c.conceptId,
          score: c.score,
          term: c.term,
          fsn: c.fsn,
          semantic_tag: c.semanticTag,
        })),
      }],
    };

    const response = await this.trackedFetch('POST', '/api/v1/linking', {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        verdict: 'uncertain',
        recommendedConceptId: null,
        reasoning: 'Backend analysis failed',
        keyFactors: [],
        error: errorText,
      };
    }

    const data: ApiLinkingResponse = await response.json();
    const linked = data.entities[0];
    if (!linked) {
      return {
        verdict: 'uncertain',
        recommendedConceptId: null,
        reasoning: 'No analysis returned',
        keyFactors: [],
      };
    }

    return {
      verdict: (linked.verdict as AnalysisResult['verdict']) || 'uncertain',
      recommendedConceptId: linked.recommended_concept_id ?? null,
      reasoning: linked.explanation || '',
      keyFactors: linked.key_factors || [],
      ambiguityNote: linked.ambiguity_note,
      alternativeConsiderations: linked.alternative_considerations?.map(a => ({
        conceptId: a.concept_id,
        reason: a.reason,
      })),
    };
  }
}
