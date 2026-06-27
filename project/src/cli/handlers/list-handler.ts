/**
 * List Command Handlers
 * Handles listing characters, locations, chapters, plots, and issues
 */

import type { ParsedArgs, CommandContext } from '../types.js';

// ─── DB row types ─────────────────────────────────────────────────────────────

interface CharacterRow extends Record<string, unknown> {
  id: number;
  name: string;
  full_name: string | null;
  role: string | null;
  summary: string | null;
  created_at: string;
}

interface LocationRow extends Record<string, unknown> {
  id: number;
  name: string;
  location_type: string | null;
  description: string | null;
  created_at: string;
}

interface ChapterRow extends Record<string, unknown> {
  id: number;
  chapter_number: number;
  title: string | null;
  pov_character: string | null;
  word_count: number | null;
  status: string | null;
  created_at: string;
}

interface PlotRow extends Record<string, unknown> {
  id: number;
  thread_name: string;
  thread_type: string;
  description: string | null;
  status: string;
  priority: number;
  created_at: string;
}

interface IssueRow extends Record<string, unknown> {
  id: number;
  issue_type: string;
  severity: string;
  description: string;
  status: string;
  detected_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle: /novel list characters
 */
export async function handleListCharacters(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { flags } = args;
  const { extension, output, projectId } = context;

  if (!extension || !projectId) {
    output.error('Extension not initialized properly.');
    return;
  }

  const spinner = output.spinner('Loading characters...');

  try {
    const mcpClient = extension['mcpClient'];

    // Build query
    let query = `
      SELECT
        id, name, full_name, role, summary,
        created_at
      FROM characters
      WHERE project_id = ?
    `;
    const params: unknown[] = [projectId];

    // Add role filter if specified
    if (flags.role) {
      query += ' AND role = ?';
      params.push(flags.role);
    }

    query += ' ORDER BY role, name';

    const characters = await mcpClient.readQuery<CharacterRow>(query, params);

    spinner.stop();

    if (characters.length === 0) {
      output.info('No characters found.');
      output.newline();
      output.info('Create your first character:');
      output.code('/novel create character --name "Name" --role protagonist --summary "Description"');
      return;
    }

    const format = (flags.format as string) || 'table';

    output.success(`Found ${characters.length} character(s)`);
    output.newline();

    if (format === 'table') {
      // Table format
      output.table(characters, ['name', 'role', 'summary']);
    } else if (format === 'list') {
      // List format
      for (const char of characters) {
        output.info(`${char.name} (${char.role})`);
      }
    } else {
      // Detailed format
      for (const char of characters) {
        output.heading(char.name);
        output.keyValue({
          'Full Name': char.full_name ?? '(none)',
          'Role': char.role ?? '(none)',
          'Summary': char.summary ?? '(none)',
          'Created': new Date(char.created_at).toLocaleDateString(),
        });
        output.newline();
      }
    }
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Failed to list characters: ${(error as Error).message}`);
  }
}

/**
 * Handle: /novel list locations
 */
export async function handleListLocations(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { flags } = args;
  const { extension, output, projectId } = context;

  if (!extension || !projectId) {
    output.error('Extension not initialized properly.');
    return;
  }

  const spinner = output.spinner('Loading locations...');

  try {
    const mcpClient = extension['mcpClient'];

    // Build query
    let query = `
      SELECT
        id, name, location_type, description,
        created_at
      FROM locations
      WHERE project_id = ?
    `;
    const params: unknown[] = [projectId];

    // Add type filter if specified
    if (flags.type) {
      query += ' AND location_type = ?';
      params.push(flags.type);
    }

    query += ' ORDER BY location_type, name';

    const locations = await mcpClient.readQuery<LocationRow>(query, params);

    spinner.stop();

    if (locations.length === 0) {
      output.info('No locations found.');
      output.newline();
      output.info('Create your first location:');
      output.code('/novel create location --name "Name" --description "Description"');
      return;
    }

    const format = (flags.format as string) || 'table';

    output.success(`Found ${locations.length} location(s)`);
    output.newline();

    if (format === 'table') {
      // Table format
      output.table(locations, ['name', 'location_type', 'description']);
    } else if (format === 'list') {
      // List format
      for (const loc of locations) {
        const typeStr = loc.location_type ? ` (${loc.location_type})` : '';
        output.info(`${loc.name}${typeStr}`);
      }
    } else {
      // Detailed format
      for (const loc of locations) {
        output.heading(loc.name);
        output.keyValue({
          'Type': loc.location_type ?? '(none)',
          'Description': loc.description ?? '(none)',
          'Created': new Date(loc.created_at).toLocaleDateString(),
        });
        output.newline();
      }
    }
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Failed to list locations: ${(error as Error).message}`);
  }
}

/**
 * Handle: /novel list chapters
 */
export async function handleListChapters(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { flags } = args;
  const { extension, output, projectId } = context;

  if (!extension || !projectId) {
    output.error('Extension not initialized properly.');
    return;
  }

  const spinner = output.spinner('Loading chapters...');

  try {
    const mcpClient = extension['mcpClient'];

    // Build query
    let query = `
      SELECT
        c.id, c.chapter_number, c.title,
        ch.name AS pov_character,
        c.word_count, c.status, c.created_at
      FROM chapters c
      LEFT JOIN characters ch ON ch.id = c.pov_character_id
      WHERE c.project_id = ?
    `;
    const params: unknown[] = [projectId];

    // Add POV filter if specified
    if (flags.pov) {
      query += ' AND ch.name LIKE ?';
      params.push(`%${flags.pov}%`);
    }

    query += ' ORDER BY c.chapter_number';

    const chapters = await mcpClient.readQuery<ChapterRow>(query, params);

    spinner.stop();

    if (chapters.length === 0) {
      output.info('No chapters found.');
      output.newline();
      output.info('Create your first chapter:');
      output.code('/novel create chapter --title "Chapter Title" --number 1');
      return;
    }

    const format = (flags.format as string) || 'table';

    output.success(`Found ${chapters.length} chapter(s)`);
    output.newline();

    if (format === 'table') {
      // Table format
      const tableData = chapters.map((ch) => ({
        chapter: ch.chapter_number,
        title: ch.title,
        pov: ch.pov_character ?? '(none)',
        words: ch.word_count ?? 0,
        status: ch.status ?? 'draft',
      }));
      output.table(tableData, ['chapter', 'title', 'pov', 'words', 'status']);
    } else if (format === 'list') {
      // List format
      for (const ch of chapters) {
        output.info(`Chapter ${ch.chapter_number}: ${ch.title}`);
      }
    } else {
      // Detailed format
      for (const ch of chapters) {
        output.heading(`Chapter ${ch.chapter_number}: ${ch.title ?? 'Untitled'}`);
        output.keyValue({
          'POV': ch.pov_character ?? '(none)',
          'Word Count': (ch.word_count ?? 0).toString(),
          'Status': ch.status ?? 'draft',
          'Created': new Date(ch.created_at).toLocaleDateString(),
        });
        output.newline();
      }
    }
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Failed to list chapters: ${(error as Error).message}`);
  }
}

/**
 * Handle: /novel list plots
 */
export async function handleListPlots(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { flags } = args;
  const { extension, output, projectId } = context;

  if (!extension || !projectId) {
    output.error('Extension not initialized properly.');
    return;
  }

  const spinner = output.spinner('Loading plot threads...');

  try {
    const mcpClient = extension['mcpClient'];

    // Build query
    let query = `
      SELECT
        id, thread_name, thread_type, description,
        status, priority, created_at
      FROM plot_threads
      WHERE project_id = ?
    `;
    const params: unknown[] = [projectId];

    // Add type filter if specified
    if (flags.type) {
      query += ' AND thread_type = ?';
      params.push(flags.type);
    }

    // Add status filter if specified
    if (flags.status) {
      query += ' AND status = ?';
      params.push(flags.status);
    }

    query += ' ORDER BY priority DESC, thread_name';

    const plots = await mcpClient.readQuery<PlotRow>(query, params);

    spinner.stop();

    if (plots.length === 0) {
      output.info('No plot threads found.');
      output.newline();
      output.info('Create your first plot thread:');
      output.code('/novel create plot --name "Plot Name" --type subplot');
      return;
    }

    const format = (flags.format as string) || 'table';

    output.success(`Found ${plots.length} plot thread(s)`);
    output.newline();

    if (format === 'table') {
      // Table format
      const tableData = plots.map((p) => ({
        name: p.thread_name,
        type: p.thread_type,
        status: p.status,
        priority: p.priority,
      }));
      output.table(tableData, ['name', 'type', 'status', 'priority']);
    } else if (format === 'list') {
      // List format
      for (const p of plots) {
        output.info(`${p.thread_name} (${p.thread_type}, ${p.status})`);
      }
    } else {
      // Detailed format
      for (const p of plots) {
        output.heading(p.thread_name);
        output.keyValue({
          'Type': p.thread_type,
          'Status': p.status,
          'Priority': p.priority.toString(),
          'Description': p.description ?? '(none)',
          'Created': new Date(p.created_at).toLocaleDateString(),
        });
        output.newline();
      }
    }
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Failed to list plot threads: ${(error as Error).message}`);
  }
}

/**
 * Handle: /novel list issues
 */
export async function handleListIssues(
  args: ParsedArgs,
  context: CommandContext
): Promise<void> {
  const { flags } = args;
  const { extension, output, projectId } = context;

  if (!extension || !projectId) {
    output.error('Extension not initialized properly.');
    return;
  }

  const spinner = output.spinner('Loading consistency issues...');

  try {
    const mcpClient = extension['mcpClient'];

    // Build query
    let query = `
      SELECT
        id, issue_type, severity, description,
        status, detected_at
      FROM consistency_issues
      WHERE project_id = ?
    `;
    const params: unknown[] = [projectId];

    // Add severity filter if specified
    if (flags.severity) {
      query += ' AND severity = ?';
      params.push(flags.severity);
    }

    // Add type filter if specified
    if (flags.type) {
      query += ' AND issue_type = ?';
      params.push(flags.type);
    }

    // Add status filter (default to open)
    const status = (flags.status as string) || 'open';
    query += ' AND status = ?';
    params.push(status);

    query += ' ORDER BY severity DESC, detected_at DESC';

    const issues = await mcpClient.readQuery<IssueRow>(query, params);

    spinner.stop();

    if (issues.length === 0) {
      output.success('No issues found! Your manuscript is consistent.');
      return;
    }

    output.warning(`Found ${issues.length} consistency issue(s)`);
    output.newline();

    // Group by severity
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');
    const info = issues.filter((i) => i.severity === 'info');

    if (errors.length > 0) {
      output.heading(`Errors (${errors.length})`);
      for (const issue of errors) {
        output.error(`[${issue.issue_type}] ${issue.description}`);
      }
      output.newline();
    }

    if (warnings.length > 0) {
      output.heading(`Warnings (${warnings.length})`);
      for (const issue of warnings) {
        output.warning(`[${issue.issue_type}] ${issue.description}`);
      }
      output.newline();
    }

    if (info.length > 0) {
      output.heading(`Info (${info.length})`);
      for (const issue of info) {
        output.info(`[${issue.issue_type}] ${issue.description}`);
      }
      output.newline();
    }

    output.info('Run consistency checks:');
    output.code('/novel check consistency');
  } catch (error: unknown) {
    spinner.stop('Failed');
    output.error(`Failed to list issues: ${(error as Error).message}`);
  }
}
