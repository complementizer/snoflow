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

export class AzureOpenAIProvider implements LLMProvider {
  private endpoint: string;
  private apiKey: string;
  private deploymentName: string;
  private apiVersion: string;

  constructor(endpoint: string, apiKey: string, deploymentName: string, apiVersion: string = '2024-02-15-preview') {
    this.endpoint = endpoint.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.deploymentName = deploymentName;
    this.apiVersion = apiVersion;
  }

  private get url(): string {
    return `${this.endpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;
  }

  private async complete(systemPrompt: string, userPrompt: string, options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {}): Promise<string> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify({
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
      throw new Error(`Azure OpenAI ${response.status}: ${text}`);
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

    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify({
        messages: allMessages,
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!response.ok) throw new Error(`Azure OpenAI ${response.status}`);

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
