/**
 * Complete usage example for Claude Novel Writer extension
 */

import { NovelWriterExtension } from '../src/index.js';
import { join } from 'path';

async function main() {
  // Initialize extension
  const projectPath = join(process.cwd(), 'my-novel');
  const ext = new NovelWriterExtension(projectPath);

  // ========================================
  // 1. Initialize New Project
  // ========================================
  console.log('Initializing project...');
  await ext.initialize({
    title: 'The Signal',
    author: 'Jane Doe',
    genre: 'Science Fiction',
    targetWordCount: 85000,
    projectPath,
  });

  // ========================================
  // 2. Sync Character Files
  // ========================================
  console.log('\nSyncing characters...');
  const charSync = ext.getCharacterSync();

  // Sync all character files
  await charSync.syncCharacterFile('characters/sarah.yml');
  await charSync.syncCharacterFile('characters/tom.yml');

  // ========================================
  // 3. Sync Locations
  // ========================================
  console.log('\nSyncing locations...');
  const locSync = ext.getLocationSync();

  await locSync.syncLocationFile('world/seti-observatory.yml');
  await locSync.syncLocationFile('world/control-room.yml');

  // ========================================
  // 4. Sync Chapters
  // ========================================
  console.log('\nSyncing chapters...');
  const chapSync = ext.getChapterSync();

  await chapSync.syncChapterFile('chapters/01-first-contact.md');
  await chapSync.syncChapterFile('chapters/02-verification.md');
  await chapSync.syncChapterFile('chapters/03-revelation.md');

  // ========================================
  // 5. Get Project Health
  // ========================================
  console.log('\n=== Project Health ===');
  const health = await ext.getProjectHealth();
  console.log(`Title: ${health.title}`);
  console.log(`Phase: ${health.current_phase}`);
  console.log(`Chapters: ${health.total_chapters}`);
  console.log(`Total Words: ${health.total_words}`);
  console.log(`Active Plot Threads: ${health.active_plot_threads}`);
  console.log(`Issues: ${health.critical_issues} errors, ${health.warnings} warnings`);

  // ========================================
  // 6. Load Scene Context
  // ========================================
  console.log('\n=== Scene Context ===');
  const assembler = ext.getContextAssembler();

  // Assuming scene ID 1 exists
  const context = await assembler.assembleContext(1, {
    recentChapterCount: 2,
    detailedCharacters: true,
    includeWorldRules: true,
  });

  console.log(`Scene: ${context.scene.title}`);
  console.log(`Characters: ${context.characters.map((c) => c.name).join(', ')}`);
  console.log(`Location: ${context.location?.name || 'None'}`);
  console.log(`Plot Threads: ${context.plotThreads.length}`);

  // Format as markdown for AI
  const markdown = assembler.formatContextAsMarkdown(context);
  console.log('\n--- Context Markdown ---');
  console.log(markdown.substring(0, 500) + '...');

  // Estimate token count
  const tokens = assembler.estimateTokenCount(context);
  console.log(`\nEstimated tokens: ${tokens}`);

  // ========================================
  // 7. Check Consistency
  // ========================================
  console.log('\n=== Consistency Check ===');
  const checker = ext.getConsistencyChecker();

  const result = await checker.checkAll();
  console.log(
    `Found ${result.errors} errors, ${result.warnings} warnings, ${result.info} info`
  );

  // Display issues
  if (result.issues.length > 0) {
    console.log('\nIssues:');
    for (const issue of result.issues.slice(0, 5)) {
      console.log(`[${issue.severity}] ${issue.description}`);
    }
  }

  // Get open issues
  const openIssues = await checker.getOpenIssues('error');
  console.log(`\nOpen errors: ${openIssues.length}`);

  // Acknowledge an issue
  if (openIssues.length > 0) {
    await checker.acknowledgeIssue(
      openIssues[0].id,
      'Will fix during revision pass'
    );
    console.log('Acknowledged first issue');
  }

  // ========================================
  // 8. Track Plot Threads
  // ========================================
  console.log('\n=== Active Plot Threads ===');
  const threads = await ext.getActivePlotThreads();

  for (const thread of threads) {
    console.log(`- ${thread.thread_name} (${thread.thread_type})`);
    console.log(`  Priority: ${thread.priority}/5`);
    console.log(`  Beats: ${thread.beat_count}`);
    console.log(
      `  Introduced: Chapter ${thread.introduced_chapter || '?'}`
    );
  }

  // ========================================
  // 9. Check Writing Streak
  // ========================================
  console.log('\n=== Writing Streak ===');
  const streak = await ext.getWritingStreak();

  if (streak) {
    console.log(`Current streak: ${streak.current_streak_days} days`);
    console.log(`Total words (last 30 days): ${streak.total_words}`);
    console.log(`Avg words/session: ${Math.round(streak.avg_words_per_session)}`);
  } else {
    console.log('No writing sessions recorded yet');
  }

  // ========================================
  // 10. Example: Update Character
  // ========================================
  console.log('\n=== Update Character ===');

  // After editing characters/sarah.yml, re-sync
  await charSync.syncCharacterFile('characters/sarah.yml');
  console.log('Character updated in database');

  // ========================================
  // 11. Example: Resolve Issue
  // ========================================
  if (openIssues.length > 0) {
    console.log('\n=== Resolve Issue ===');
    await checker.resolveIssue(
      openIssues[0].id,
      'Fixed character description in Chapter 15'
    );
    console.log('Issue resolved');
  }

  console.log('\n=== Example Complete ===');
}

// Run example
main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
