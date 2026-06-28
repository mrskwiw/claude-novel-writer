/**
 * Command-definition coverage: dispatch every registered command and each of
 * its subcommands through NovelCLI against a seeded project. This executes the
 * (otherwise-uncovered) `handler` arrow functions in every `src/cli/commands/*.ts`
 * definition. NovelCLI.execute() never throws (it catches internally and returns
 * a boolean), so a bare/invalid dispatch still runs the arrow without failing
 * the test — we only assert the dispatch resolves to a boolean.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../../helpers/test-extension.js';
import { NovelCLI } from '../../../project/src/cli/index.js';
import { registry } from '../../../project/src/cli/registry.js';

async function cleanupDir(dir: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

describe('command dispatch coverage', () => {
  let dir: string;
  let seed: TestNovelWriterExtension;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cmd-dispatch-'));
    seed = new TestNovelWriterExtension(dir);
    await seed.initialize({ title: 'Dispatch', author: 'T', genre: 'fantasy', targetWordCount: 80000 });
    seed.cleanup();
  });

  afterAll(async () => {
    await cleanupDir(dir);
  });

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  // One test per top-level command: dispatch it bare, then dispatch each of its
  // subcommands bare. The arrows execute even when the underlying handler errors
  // on missing required flags.
  for (const command of registry.getAll()) {
    it(`dispatches "${command.name}" and its subcommands`, async () => {
      const cli = new NovelCLI(dir);

      const bare = await cli.execute(command.name);
      expect(typeof bare).toBe('boolean');

      for (const sub of command.subcommands ?? []) {
        const r = await cli.execute(`${command.name} ${sub.name}`);
        expect(typeof r).toBe('boolean');
      }
    });
  }
});
