import { LinkedEntity, ChatMessage, AnalysisResult } from '../../types';

export interface ExtractedSpan {
  mention: string;
  start: number;
  end: number;
  entityType: string;
  suggestedConceptId?: string;
  suggestedTerm?: string;
}

export interface LLMProvider {
  extractEntities(text: string): Promise<ExtractedSpan[]>;
  extractEntitiesWithCodes(text: string): Promise<ExtractedSpan[]>;
  analyzeEntity(entity: LinkedEntity, noteText: string): Promise<AnalysisResult>;
  chat(messages: ChatMessage[], noteText: string, entities: LinkedEntity[], annotations: Record<string, string>): Promise<string>;
  testConnection(): Promise<boolean>;
}

export interface LLMConfig {
  provider: 'openai' | 'azure-openai';
  apiKey: string;
  model?: string;
  endpoint?: string;
  deploymentName?: string;
  apiVersion?: string;
}

export const EXTRACTION_SYSTEM_PROMPT = `You are a clinical NLP system. Extract medical entities from the given clinical text.

For each entity, return:
- mention: the exact text span as it appears in the text (copy-paste exactly, preserving case)
- entityType: one of "finding", "disorder", "procedure", "substance", "body structure", "observable entity", "pharmaceutical", "situation"

Return ONLY a JSON array. No explanation, no markdown fences.
Example: [{"mention": "chest pain", "entityType": "finding"}]

Important:
- Extract the exact text spans — do not paraphrase or normalize
- Include medications, procedures, diagnoses, symptoms, body structures, and lab findings
- Do NOT extract demographic info, locations, or non-clinical terms`;

export const EXTRACTION_WITH_CODES_PROMPT = `You are a clinical NLP system with SNOMED CT expertise. Extract medical entities and suggest SNOMED CT concept IDs.

For each entity, return:
- mention: the exact text span (copy-paste exactly, preserving case)
- entityType: one of "finding", "disorder", "procedure", "substance", "body structure", "observable entity", "pharmaceutical", "situation"
- suggestedConceptId: your best guess for the SNOMED CT concept ID (string)
- suggestedTerm: the preferred term for that concept

Return ONLY a JSON array. No explanation, no markdown fences.

Important:
- Extract the exact text spans — do not paraphrase or normalize
- Only suggest SNOMED CT codes you are confident about. If unsure, omit suggestedConceptId.`;

export const ANALYSIS_SYSTEM_PROMPT = `You are a clinical terminology expert specializing in SNOMED CT coding. Your task is to analyze a medical mention from a clinical note and evaluate candidate SNOMED CT concepts.

Given:
1. The mention (highlighted medical term from the note)
2. The surrounding clinical context
3. A list of candidate SNOMED CT concepts with their IDs, terms, and confidence scores

Your job is to:
1. Determine if the top-ranked candidate is the correct concept for this mention in context
2. If not, recommend a better candidate from the list OR indicate special cases:
   - If NONE of the candidates are appropriate, set recommendedConceptId to "__NONE_MATCH__"
   - If this mention is NOT a medical/SNOMED concept (e.g., a name, location, or non-clinical term), set recommendedConceptId to "__NOT_LINKED__"
3. Provide clear reasoning for your decision
4. Note any ambiguity or uncertainty

Respond in JSON format with these fields:
{
  "verdict": "confident" | "likely" | "ambiguous" | "uncertain" | "no_match",
  "recommendedConceptId": "conceptId | null (top candidate is correct) | __NOT_LINKED__ | __NONE_MATCH__",
  "reasoning": "2-3 sentence explanation",
  "keyFactors": ["factor1", "factor2"],
  "ambiguityNote": "optional note about ambiguity",
  "alternativeConsiderations": [{"conceptId": "id", "reason": "why this might be relevant"}]
}

Verdicts:
- "confident": High confidence the recommendation is correct
- "likely": Probably correct but some uncertainty
- "ambiguous": Multiple valid interpretations possible
- "uncertain": Insufficient context to determine
- "no_match": Confident that the correct concept is NOT among the candidates (use with recommendedConceptId: "__NONE_MATCH__")`;

export const CHAT_SYSTEM_PROMPT = `You are a clinical terminology assistant helping with SNOMED CT entity linking. You have access to a clinical note and the extracted medical entities with their candidate SNOMED CT concepts.

Your role is to:
1. Answer questions about the clinical note
2. Help clarify ambiguous entity mappings
3. Provide guidance on SNOMED CT concept selection
4. Summarize the note or specific sections

Be concise and helpful. When referring to specific entities or concepts, be specific about which ones you mean.`;

// ---- Chat priming messages (used to seed the conversation context) ----

export const CHAT_CONTEXT_PREFIX = 'Here is the context:\n\n';
export const CHAT_PRIMING_MESSAGE = 'I have the clinical note and extracted entities. How can I help?';

// ---- Test connection prompts ----

export const TEST_SYSTEM_PROMPT = 'You are a test.';
export const TEST_USER_PROMPT = 'Reply with "ok".';

// ---- Prompt builder functions ----

export function buildAnalysisPrompt(entity: LinkedEntity, noteText: string): string {
  const contextStart = Math.max(0, entity.start - 200);
  const contextEnd = Math.min(noteText.length, entity.end + 200);
  const context = noteText.slice(contextStart, contextEnd);

  const candidatesText = entity.candidates
    .slice(0, 5)
    .map((c, i) => `${i + 1}. [${c.conceptId}] ${c.term} (${c.semanticTag}) - Score: ${(c.score * 100).toFixed(1)}%`)
    .join('\n');

  return `**Mention:** "${entity.mention}"
**Entity Type:** ${entity.entityType}

**Clinical Context:**
"...${context}..."

**Candidate SNOMED CT Concepts:**
${candidatesText}

Analyze whether the top candidate is correct for this mention in context. If a different candidate is more appropriate, recommend it.`;
}

export function buildChatContext(noteText: string, entities: LinkedEntity[], annotations: Record<string, string>): string {
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

  return `**Clinical Note:**
${noteText}

**Extracted Entities (${entities.length} total):**
${entitiesSummary}`;
}

export function parseAnalysisResponse(responseText: string): AnalysisResult {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      verdict: parsed.verdict || 'uncertain',
      recommendedConceptId: parsed.recommendedConceptId || null,
      reasoning: parsed.reasoning || 'Unable to parse reasoning',
      keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors : [],
      ambiguityNote: parsed.ambiguityNote,
      alternativeConsiderations: parsed.alternativeConsiderations?.map((a: { conceptId: string; reason: string }) => ({
        conceptId: a.conceptId,
        reason: a.reason,
      })),
    };
  } catch {
    return {
      verdict: 'uncertain',
      recommendedConceptId: null,
      reasoning: responseText.slice(0, 500),
      keyFactors: [],
      ambiguityNote: 'Could not parse structured response',
    };
  }
}

export function parseExtractionResponse(responseText: string, sourceText: string): ExtractedSpan[] {
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const items = parsed.filter(
      (e: Record<string, unknown>) => typeof e.mention === 'string'
    );

    const spans: ExtractedSpan[] = [];
    let searchFrom = 0;

    for (const e of items) {
      const mention = e.mention as string;
      const idx = sourceText.indexOf(mention, searchFrom);
      if (idx === -1) {
        const fallback = sourceText.toLowerCase().indexOf(mention.toLowerCase(), searchFrom);
        if (fallback === -1) continue;
        spans.push({
          mention: sourceText.slice(fallback, fallback + mention.length),
          start: fallback,
          end: fallback + mention.length,
          entityType: (e.entityType as string) || 'finding',
          suggestedConceptId: e.suggestedConceptId as string | undefined,
          suggestedTerm: e.suggestedTerm as string | undefined,
        });
        searchFrom = fallback + mention.length;
      } else {
        spans.push({
          mention,
          start: idx,
          end: idx + mention.length,
          entityType: (e.entityType as string) || 'finding',
          suggestedConceptId: e.suggestedConceptId as string | undefined,
          suggestedTerm: e.suggestedTerm as string | undefined,
        });
        searchFrom = idx + mention.length;
      }
    }

    return spans;
  } catch {
    return [];
  }
}
