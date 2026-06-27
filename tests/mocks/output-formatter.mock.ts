/**
 * Mock Output Formatter for testing CLI output
 */

import type { OutputFormatter } from '../../project/src/cli/types.js';

interface Message {
  type: string;
  message: string;
}

export class MockOutputFormatter implements OutputFormatter {
  public messages: Message[] = [];
  public spinners: Array<{ message: string; stopped: boolean }> = [];

  success(message: string): void {
    this.messages.push({ type: 'success', message });
  }

  error(message: string): void {
    this.messages.push({ type: 'error', message });
  }

  warning(message: string): void {
    this.messages.push({ type: 'warning', message });
  }

  info(message: string): void {
    this.messages.push({ type: 'info', message });
  }

  table(data: any[], columns?: string[]): void {
    this.messages.push({
      type: 'table',
      message: JSON.stringify({ data, columns }),
    });
  }

  list(items: string[], icon?: string): void {
    this.messages.push({
      type: 'list',
      message: JSON.stringify({ items, icon }),
    });
  }

  section(title: string, content: string): void {
    this.messages.push({
      type: 'section',
      message: JSON.stringify({ title, content }),
    });
  }

  spinner(message: string): { stop: (message?: string) => void } {
    const spinnerIndex = this.spinners.length;
    this.spinners.push({ message, stopped: false });

    return {
      stop: (stopMessage?: string) => {
        this.spinners[spinnerIndex].stopped = true;
        if (stopMessage) {
          this.messages.push({ type: 'spinner-stop', message: stopMessage });
        }
      },
    };
  }

  newline(): void {
    this.messages.push({ type: 'newline', message: '' });
  }

  heading(title: string): void {
    this.messages.push({ type: 'heading', message: title });
  }

  keyValue(data: Record<string, any>): void {
    this.messages.push({
      type: 'keyValue',
      message: JSON.stringify(data),
    });
  }

  code(content: string, language?: string): void {
    this.messages.push({
      type: 'code',
      message: JSON.stringify({ content, language }),
    });
  }

  /**
   * Test helper: Get all messages of a specific type
   */
  getMessages(type?: string): string[] {
    if (type) {
      return this.messages
        .filter((m) => m.type === type)
        .map((m) => m.message);
    }
    return this.messages.map((m) => m.message);
  }

  /**
   * Test helper: Check if a message exists
   */
  hasMessage(type: string, content: string): boolean {
    return this.messages.some(
      (m) => m.type === type && m.message.includes(content)
    );
  }

  /**
   * Test helper: Get message count
   */
  getMessageCount(type?: string): number {
    if (type) {
      return this.messages.filter((m) => m.type === type).length;
    }
    return this.messages.length;
  }

  /**
   * Test helper: Clear all messages
   */
  clear(): void {
    this.messages = [];
    this.spinners = [];
  }

  /**
   * Test helper: Get last message
   */
  getLastMessage(type?: string): string | undefined {
    const messages = type
      ? this.messages.filter((m) => m.type === type)
      : this.messages;
    return messages[messages.length - 1]?.message;
  }

  /**
   * Test helper: Assert message exists
   */
  assertHasMessage(type: string, content: string): void {
    const hasMsg = this.hasMessage(type, content);
    if (!hasMsg) {
      throw new Error(
        `Expected ${type} message containing "${content}", but not found. Messages: ${JSON.stringify(this.messages)}`
      );
    }
  }
}
