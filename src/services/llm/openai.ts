import { LinkedEntity, ChatMessage, AnalysisResult } from '../../types';
import {
  LLMProvider,
  ExtractedSpan,
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_WITH_CODES_PROMPT,
  ANALYSIS_SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  CHAT_CONTEXT_PREFIX,
  CHAT_PRIMING_MESSAGE,
  TEST_SYSTEM_PROMPT,
  TEST_USER_PROMPT,
  buildAnalysisPrompt,
  buildChatContext,
  parseAnalysisResponse,
  parseExtractionResponse,
} from './types';

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async complete(systemPrompt: string, userPrompt: string, options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {}): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 2000,
        ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI ${response.status}: ${text}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async extractEntities(text: string): Promise<ExtractedSpan[]> {
    const content = await this.complete(EXTRACTION_SYSTEM_PROMPT, text, { temperature: 0.1 });
    return parseExtractionResponse(content, text);
  }

  async extractEntitiesWithCodes(text: string): Promise<ExtractedSpan[]> {
    const content = await this.complete(EXTRACTION_WITH_CODES_PROMPT, text, { temperature: 0.1 });
    return parseExtractionResponse(content, text);
  }

  async analyzeEntity(entity: LinkedEntity, noteText: string): Promise<AnalysisResult> {
    try {
      const content = await this.complete(
        ANALYSIS_SYSTEM_PROMPT,
        buildAnalysisPrompt(entity, noteText),
        { jsonMode: true, maxTokens: 1000 }
      );
      return parseAnalysisResponse(content);
    } catch (err) {
      return {
        verdict: 'uncertain',
        recommendedConceptId: null,
        reasoning: 'Failed to get AI analysis',
        keyFactors: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async chat(
    messages: ChatMessage[],
    noteText: string,
    entities: LinkedEntity[],
    annotations: Record<string, string>
  ): Promise<string> {
    const contextMsg = buildChatContext(noteText, entities, annotations);

    const allMessages = [
      { role: 'system' as const, content: CHAT_SYSTEM_PROMPT },
      { role: 'user' as const, content: `${CHAT_CONTEXT_PREFIX}${contextMsg}` },
      { role: 'assistant' as const, content: CHAT_PRIMING_MESSAGE },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.complete(TEST_SYSTEM_PROMPT, TEST_USER_PROMPT, { maxTokens: 5 });
      return true;
    } catch {
      return false;
    }
  }
}
