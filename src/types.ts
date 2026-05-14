export interface ConceptCandidate {
  conceptId: string;
  term: string;
  fsn: string;
  semanticTag: string;
  score: number;
  manual?: boolean;
}

export interface AlternativeConsideration {
  conceptId: string;
  reason: string;
}

export interface LinkedEntity {
  mention: string;
  entityType: EntityType;
  start: number;
  end: number;
  candidates: ConceptCandidate[];
  explanation?: string;
  verdict?: ExplanationVerdict;
  recommendedConceptId?: string | null;
  keyFactors?: string[];
  ambiguityNote?: string;
  alternativeConsiderations?: AlternativeConsideration[];
  linkingError?: string;
  linkedViaBackend?: boolean;
  modelName?: string;
}

export interface EntityLinkingResponse {
  text: string;
  entities: LinkedEntity[];
  processingTimeMs: number;
}

export type EntityType = string;

export interface Annotation {
  entityKey: string;
  selectedConceptId: string;
}

export const NOT_LINKED = '__NOT_LINKED__';
export const NONE_MATCH = '__NONE_MATCH__';
export const UNSURE = '__UNSURE__';

// ---------------------------------------------------------------------------
// Match-score & annotation-certainty scoring
// ---------------------------------------------------------------------------

export type MatchScoreLevel = 'high' | 'medium' | 'low';
export type CertaintyLevel = 'high' | 'medium' | 'low' | 'no_match' | 'unknown';

export interface Suggestion {
  type: 'uncertain' | 'low_match' | 'close_scores';
  message: string;
  action?: string;
}

export function getMatchScoreLevel(score: number): MatchScoreLevel {
  if (score >= 0.95) return 'high';
  if (score >= 0.88) return 'medium';
  return 'low';
}

export function getCertaintyLevel(verdict: ExplanationVerdict | undefined): CertaintyLevel {
  if (!verdict) return 'unknown';
  switch (verdict) {
    case 'confident': return 'high';
    case 'likely': return 'medium';
    case 'no_match': return 'no_match';
    case 'ambiguous':
    case 'uncertain': return 'low';
  }
}

export function getCertaintyLabel(verdict: ExplanationVerdict | undefined): string | null {
  if (!verdict) return null;
  if (verdict === 'no_match') return 'No Match';
  return verdict.charAt(0).toUpperCase() + verdict.slice(1);
}

export function isUncertain(verdict: ExplanationVerdict | undefined): boolean {
  return verdict === 'ambiguous' || verdict === 'uncertain' || verdict === 'no_match';
}

export function getSuggestions(entity: LinkedEntity): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const candidates = entity.candidates;

  if (candidates.length === 0) {
    suggestions.push({
      type: 'low_match',
      message: 'No matching concepts found',
      action: 'This mention may not be a medical term',
    });
    return suggestions;
  }

  const topScore = candidates[0].score;

  if (candidates.length >= 2) {
    const gap = candidates[0].score - candidates[1].score;
    if (gap < 0.05) {
      suggestions.push({
        type: 'close_scores',
        message: `Top candidates have nearly equal scores (${(gap * 100).toFixed(1)}% difference)`,
        action: 'Carefully compare the top options',
      });
    } else if (gap < 0.10) {
      suggestions.push({
        type: 'close_scores',
        message: `Close competition between top candidates (${(gap * 100).toFixed(1)}% gap)`,
        action: 'Review to confirm the best match',
      });
    }
  }

  if (topScore < 0.70) {
    suggestions.push({
      type: 'low_match',
      message: `Low match score (${(topScore * 100).toFixed(1)}%)`,
      action: 'Consider if a better match exists',
    });
  } else if (topScore < 0.85) {
    suggestions.push({
      type: 'low_match',
      message: `Moderate match score (${(topScore * 100).toFixed(1)}%)`,
      action: 'Verify this is the correct concept',
    });
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Display & color
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Chat / LLM types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export type ExplanationVerdict = 'confident' | 'likely' | 'ambiguous' | 'uncertain' | 'no_match';

export interface LLMExplanation {
  verdict: ExplanationVerdict;
  recommendedConceptId: string | null;
  reasoning: string;
  keyFactors: string[];
  ambiguityNote?: string;
  alternativeConsiderations?: Array<{
    conceptId: string;
    reason: string;
  }>;
}

export interface AnalysisResult extends LLMExplanation {
  error?: string;
  modelName?: string;
}

// ---------------------------------------------------------------------------
// Export types
// ---------------------------------------------------------------------------

export type AnnotationStatus = 'confirmed' | 'auto-accepted' | 'skipped' | 'unsure' | 'pending';

export interface ExportedAnnotation {
  noteId: string;
  exportedAt: string;
  originalText: string;
  annotations: Array<{
    mention: string;
    start: number;
    end: number;
    entityType: string;
    conceptId: string | null;
    conceptTerm: string | null;
    semanticTag?: string;
    matchScore: number;
    status: AnnotationStatus;
    wasUncertain: boolean;
    notLinked: boolean;
  }>;
  summary: {
    totalEntities: number;
    confirmed: number;
    autoAccepted: number;
    notLinked: number;
    unsure: number;
    pending: number;
  };
}

// ---------------------------------------------------------------------------
// Resolver types
// ---------------------------------------------------------------------------

export type ResolverMode = 'snowstorm' | 'custom-backend';

export type LLMProviderType = 'openai' | 'azure-openai';

export interface ConceptInfo {
  conceptId: string;
  term: string;
  fsn: string;
}

export interface ConceptRelationship {
  type: string;
  typeId: string;
  target: ConceptInfo;
}

export interface HierarchyResponse {
  concept: ConceptInfo;
  parents: ConceptInfo[];
  children: ConceptInfo[];
  childrenTruncated: boolean;
  relationships: ConceptRelationship[];
}
