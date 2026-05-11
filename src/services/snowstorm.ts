import { ConceptCandidate, ConceptInfo, HierarchyResponse } from '../types';

export interface SearchOptions {
  limit?: number;
  semanticTag?: string;
}

interface SnowstormDescription {
  term: string;
  active: boolean;
  type: string;
  concept: {
    conceptId: string;
    active: boolean;
    fsn: { term: string; lang: string };
    pt: { term: string; lang: string };
  };
}

interface SnowstormConcept {
  conceptId: string;
  active: boolean;
  fsn: { term: string; lang: string };
  pt: { term: string; lang: string };
  definitionStatus?: string;
}

function parseSemanticTag(fsn: string): string {
  const match = fsn.match(/\(([^)]+)\)$/);
  return match ? match[1] : 'unknown';
}

function computeMatchScore(searchTerm: string, candidateTerm: string, candidateFsn: string): number {
  const search = searchTerm.toLowerCase().trim();
  const term = candidateTerm.toLowerCase().trim();
  const fsn = candidateFsn.toLowerCase().trim();

  if (term === search) return 1.0;
  if (fsn.startsWith(search + ' (')) return 0.98;
  if (term.startsWith(search) || search.startsWith(term)) return 0.95;

  const searchWords = search.split(/\s+/);
  const termWords = term.split(/\s+/);
  const overlap = searchWords.filter(w => termWords.includes(w)).length;
  const overlapRatio = overlap / Math.max(searchWords.length, termWords.length);
  return 0.70 + overlapRatio * 0.20;
}

function mapConceptToInfo(c: SnowstormConcept): ConceptInfo {
  return {
    conceptId: c.conceptId,
    term: c.pt.term,
    fsn: c.fsn.term,
  };
}

const cacheEnabled = !!import.meta.env.VITE_SNOWSTORM_CACHE_FILE;
const cacheOnly = import.meta.env.VITE_SNOWSTORM_CACHE_ONLY === 'true';

export class SnowstormClient {
  private baseUrl: string;
  private inflight = 0;
  private queue: Array<() => void> = [];
  private maxConcurrent = 3;
  private cache: Record<string, unknown> = {};
  private cacheLoaded: Promise<void> | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || 'https://browser.ihtsdotools.org/snowstorm/snomed-ct').replace(/\/$/, '');
    if (cacheEnabled || cacheOnly) {
      this.cacheLoaded = this.loadCacheFile();
    }
  }

  private async loadCacheFile(): Promise<void> {
    try {
      const res = await fetch('/__snowstorm_cache');
      if (res.ok) this.cache = await res.json();
    } catch {
      // cache file doesn't exist yet
    }
  }

  private async persistCacheEntry(key: string, value: unknown): Promise<void> {
    try {
      await fetch('/__snowstorm_cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
    } catch {
      // dev server not available — ignore
    }
  }

  private async throttle(): Promise<void> {
    if (this.inflight < this.maxConcurrent) {
      this.inflight++;
      return;
    }
    await new Promise<void>(resolve => this.queue.push(resolve));
    this.inflight++;
  }

  private release(): void {
    this.inflight--;
    const next = this.queue.shift();
    if (next) next();
  }

  private async fetchJson<T>(path: string, retries = 2): Promise<T> {
    if (this.cacheLoaded) await this.cacheLoaded;

    if ((cacheEnabled || cacheOnly) && path in this.cache) {
      return this.cache[path] as T;
    }

    if (cacheOnly) {
      throw new Error(`Snowstorm cache-only: no cached response for ${path}`);
    }

    await this.throttle();
    try {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const response = await fetch(`${this.baseUrl}${path}`, {
          headers: { 'Accept-Language': 'en' },
        });

        if (response.status === 429 && attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }

        if (!response.ok) {
          throw new Error(`Snowstorm ${response.status}: ${response.statusText}`);
        }

        const data: T = await response.json();

        if (cacheEnabled) {
          this.cache[path] = data;
          this.persistCacheEntry(path, data);
        }

        return data;
      }
      throw new Error('Snowstorm: max retries exceeded');
    } finally {
      this.release();
    }
  }

  async searchDescriptions(term: string, options: SearchOptions = {}): Promise<ConceptCandidate[]> {
    const limit = options.limit || 10;
    const params = new URLSearchParams({
      term,
      active: 'true',
      conceptActive: 'true',
      groupByConcept: 'true',
      limit: String(limit),
    });
    if (options.semanticTag) {
      params.set('semanticTag', options.semanticTag);
    }

    let data: { items: SnowstormDescription[] };
    try {
      data = await this.fetchJson<{ items: SnowstormDescription[] }>(
        `/browser/MAIN/descriptions?${params}`
      );
    } catch {
      return [];
    }

    const seen = new Set<string>();
    const candidates: ConceptCandidate[] = [];

    for (const item of data.items) {
      const id = item.concept.conceptId;
      if (seen.has(id)) continue;
      seen.add(id);

      const fsn = item.concept.fsn.term;
      const pt = item.concept.pt.term;

      candidates.push({
        conceptId: id,
        term: pt,
        fsn,
        semanticTag: parseSemanticTag(fsn),
        score: computeMatchScore(term, pt, fsn),
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  async getConceptDetails(conceptId: string): Promise<ConceptInfo | null> {
    try {
      const data = await this.fetchJson<SnowstormConcept>(
        `/browser/MAIN/concepts/${conceptId}`
      );
      return mapConceptToInfo(data);
    } catch {
      return null;
    }
  }

  async getParents(conceptId: string): Promise<ConceptInfo[]> {
    try {
      const data = await this.fetchJson<SnowstormConcept[]>(
        `/MAIN/concepts/${conceptId}/parents?form=inferred`
      );
      return data.map(mapConceptToInfo);
    } catch {
      return [];
    }
  }

  async getChildren(conceptId: string): Promise<ConceptInfo[]> {
    try {
      const data = await this.fetchJson<SnowstormConcept[]>(
        `/browser/MAIN/concepts/${conceptId}/children?form=inferred`
      );
      return data.map(mapConceptToInfo);
    } catch {
      return [];
    }
  }

  async getHierarchy(conceptId: string): Promise<HierarchyResponse | null> {
    try {
      const [concept, parents, children] = await Promise.all([
        this.getConceptDetails(conceptId),
        this.getParents(conceptId),
        this.getChildren(conceptId),
      ]);

      if (!concept) return null;

      return {
        concept,
        parents,
        children: children.slice(0, 50),
        childrenTruncated: children.length > 50,
        relationships: [],
      };
    } catch {
      return null;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const data = await this.fetchJson<{ items: unknown[] }>(
        '/browser/MAIN/descriptions?term=test&limit=1'
      );
      return Array.isArray(data.items);
    } catch {
      return false;
    }
  }
}
