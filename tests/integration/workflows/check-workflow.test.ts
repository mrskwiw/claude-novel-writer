/**
 * Integration Tests: Consistency Check Workflow
 * Tests complete consistency checking workflow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NovelWriterExtension } from '../../../project/src/index.js';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { getTestProjectPath } from '../../setup.js';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { rm } from 'fs/promises';

describe('Check Workflow (Integration)', () => {
  let extension: NovelWriterExtension;
  let mcpClient: MockMCPClient;
  let projectPath: string;
  const projectId = 1;

  beforeEach(async () => {
    projectPath = getTestProjectPath();
    mcpClient = new MockMCPClient();

    // Create test directory structure
    const chaptersDir = join(projectPath, 'chapters');
    if (!existsSync(chaptersDir)) {
      mkdirSync(chaptersDir, { recursive: true });
    }

    // Mock database: insert project
    await mcpClient.writeQuery(
      'INSERT INTO projects (id, title) VALUES (?, ?)',
      [projectId, 'Test Novel']
    );

    extension = new NovelWriterExtension(projectPath);
    extension.setProjectId(projectId);

    // Inject mock client
    (extension as any).mcpClient = mcpClient;
  });

  afterEach(async () => {
    // Clean up test files
    if (existsSync(projectPath)) {
      await rm(projectPath, { recursive: true, force: true });
    }
  });

  it('should check all consistency types', async () => {
    const checker = extension.getConsistencyChecker();

    // Run all checks (should return empty on new project)
    const result = await checker.checkAll();

    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('info');
    expect(result.issues).toBeInstanceOf(Array);
  });

  it('should list open issues', async () => {
    const checker = extension.getConsistencyChecker();

    // Get all open issues
    const issues = await checker.getOpenIssues();
    expect(issues).toBeInstanceOf(Array);

    // Filter by severity
    const errors = await checker.getOpenIssues('error');
    expect(errors).toBeInstanceOf(Array);
    errors.forEach(issue => {
      expect(issue.severity).toBe('error');
    });
  });

  it('should handle issue management workflow', async () => {
    const checker = extension.getConsistencyChecker();

    // Initially should have no issues
    const initialIssues = await checker.getOpenIssues();
    expect(initialIssues).toBeInstanceOf(Array);

    // Note: Issue creation would normally happen through consistency checks
    // which detect actual inconsistencies in the manuscript
    // For direct testing of resolution methods, see unit tests
  });

  it('should filter issues by severity', async () => {
    const checker = extension.getConsistencyChecker();

    // Test all severity levels
    const errors = await checker.getOpenIssues('error');
    expect(errors).toBeInstanceOf(Array);
    errors.forEach(issue => {
      expect(issue.severity).toBe('error');
    });

    const warnings = await checker.getOpenIssues('warning');
    expect(warnings).toBeInstanceOf(Array);
    warnings.forEach(issue => {
      expect(issue.severity).toBe('warning');
    });

    const infos = await checker.getOpenIssues('info');
    expect(infos).toBeInstanceOf(Array);
    infos.forEach(issue => {
      expect(issue.severity).toBe('info');
    });
  });
});
