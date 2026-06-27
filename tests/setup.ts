/**
 * Global test setup
 * Runs before each test
 */

import { beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Test project path
let testProjectPath: string | null = null;

/**
 * Setup before each test
 */
beforeEach(async () => {
  // Create temp directory for test project
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  testProjectPath = join(tmpdir(), `novel-test-${timestamp}-${randomId}`);

  // Create project structure
  mkdirSync(testProjectPath, { recursive: true });
  mkdirSync(join(testProjectPath, 'characters'), { recursive: true });
  mkdirSync(join(testProjectPath, 'locations'), { recursive: true });
  mkdirSync(join(testProjectPath, 'plots'), { recursive: true });
  mkdirSync(join(testProjectPath, 'chapters'), { recursive: true });
  mkdirSync(join(testProjectPath, '.novel'), { recursive: true });

  // Reset all mocks
  vi.clearAllMocks();
});

/**
 * Cleanup after each test
 */
afterEach(async () => {
  // Cleanup test project
  if (testProjectPath && existsSync(testProjectPath)) {
    try {
      rmSync(testProjectPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup test project: ${error}`);
    }
    testProjectPath = null;
  }

  // Clear all timers
  vi.clearAllTimers();
});

/**
 * Get current test project path
 */
export function getTestProjectPath(): string {
  if (!testProjectPath) {
    throw new Error('Test project not initialized');
  }
  return testProjectPath;
}
