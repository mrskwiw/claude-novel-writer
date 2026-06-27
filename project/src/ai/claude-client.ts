/**
 * Claude API Client
 * Wrapper for Anthropic SDK
 */

import Anthropic from '@anthropic-ai/sdk';
import type { TextBlock } from '@anthropic-ai/sdk/resources/messages.js';

export interface ClaudeOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface ClaudeResponse {
  content: string;
  stopReason?: string;
  /** True when this is a context-prompt passthrough, not an API-generated response. */
  passthrough?: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Shared interface implemented by both ClaudeClient and PassthroughClaudeClient.
 * GenerationManager depends on this interface, not on the concrete class.
 */
export interface IClaudeClient {
  generate(prompt: string, options?: ClaudeOptions): Promise<ClaudeResponse>;
  generateStructured(prompt: string, options?: ClaudeOptions): Promise<ClaudeResponse>;
  generateCreative(prompt: string, options?: ClaudeOptions): Promise<ClaudeResponse>;
}

/**
 * Live API client — calls the Anthropic API.
 * Requires ANTHROPIC_API_KEY in the environment.
 */
export class ClaudeClient implements IClaudeClient {
  private anthropic: Anthropic;
  private defaultModel: string = 'claude-sonnet-4-6';

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        'Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable or pass to constructor.'
      );
    }
    this.anthropic = new Anthropic({ apiKey: key });
  }

  async generate(prompt: string, options: ClaudeOptions = {}): Promise<ClaudeResponse> {
    const {
      model = this.defaultModel,
      maxTokens = 2048,
      temperature = 0.7,
      systemPrompt,
    } = options;

    try {
      const message = await this.anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = message.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as TextBlock).text)
        .join('\n');

      return {
        content,
        stopReason: message.stop_reason || undefined,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Claude API Error: ${error.message}`);
      }
      throw error;
    }
  }

  async generateStructured(prompt: string, options: ClaudeOptions = {}): Promise<ClaudeResponse> {
    return this.generate(prompt, { ...options, temperature: options.temperature ?? 0.5 });
  }

  async generateCreative(prompt: string, options: ClaudeOptions = {}): Promise<ClaudeResponse> {
    return this.generate(prompt, { ...options, temperature: options.temperature ?? 0.9 });
  }

  static isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }
}

/**
 * Passthrough client used when ANTHROPIC_API_KEY is absent.
 *
 * Returns the assembled prompt verbatim instead of calling the API.
 * Claude Code's active session sees the command output and generates the content
 * directly — no separate API key required for the plugin to function.
 */
export class PassthroughClaudeClient implements IClaudeClient {
  async generate(prompt: string): Promise<ClaudeResponse> {
    return { content: prompt, stopReason: 'passthrough', passthrough: true };
  }
  async generateStructured(prompt: string): Promise<ClaudeResponse> {
    return { content: prompt, stopReason: 'passthrough', passthrough: true };
  }
  async generateCreative(prompt: string): Promise<ClaudeResponse> {
    return { content: prompt, stopReason: 'passthrough', passthrough: true };
  }
}
