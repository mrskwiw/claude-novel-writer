/**
 * QueryTrackerService — PROC-10
 *
 * Tracks literary agent query submissions for a novel project.
 * Authors send query letters, synopses, and sample pages to literary agents;
 * this service records each submission and its current status.
 *
 * All persistence is via MCPClient SQL queries.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { MCPClient } from '../core/database.js';
import { generateId } from '../utils/ids.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** The lifecycle status of an agent query submission. */
export type QueryStatus =
  | 'sent'
  | 'pending'
  | 'rejected'
  | 'partial_request'
  | 'full_request'
  | 'offer'
  | 'closed';

/** A single agent query record. */
export interface AgentQuery {
  id: string;
  projectId: string;
  agentName: string;
  agency?: string;
  queryDate: string;
  status: QueryStatus;
  responseDate?: string;
  notes?: string;
  /** e.g. ['query_letter', 'synopsis', 'first_10_pages'] */
  materialsSent: string[];
  createdAt: string;
  updatedAt: string;
}

/** Aggregate statistics for all queries on a project. */
export interface QueryStats {
  total: number;
  byStatus: Record<QueryStatus, number>;
  /** Average calendar days from queryDate to responseDate; null if no responses yet. */
  avgResponseDays: number | null;
  /** (partial_request + full_request + offer) / total; null if total === 0. */
  successRate: number | null;
}

// ── DB row shape ──────────────────────────────────────────────────────────────

interface AgentQueryRow {
  id: string;
  project_id: string;
  agent_name: string;
  agency: string | null;
  query_date: string;
  status: string;
  response_date: string | null;
  notes: string | null;
  materials_sent: string;
  created_at: string;
  updated_at: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const SUCCESS_STATUSES: QueryStatus[] = ['partial_request', 'full_request', 'offer'];

const ALL_STATUSES: QueryStatus[] = [
  'sent',
  'pending',
  'rejected',
  'partial_request',
  'full_request',
  'offer',
  'closed',
];

function rowToQuery(row: AgentQueryRow): AgentQuery {
  let materials: string[] = [];
  try {
    materials = JSON.parse(row.materials_sent) as string[];
  } catch {
    materials = [];
  }

  return {
    id: row.id,
    projectId: row.project_id,
    agentName: row.agent_name,
    agency: row.agency ?? undefined,
    queryDate: row.query_date,
    status: row.status as QueryStatus,
    responseDate: row.response_date ?? undefined,
    notes: row.notes ?? undefined,
    materialsSent: materials,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Parse an ISO date string into a UTC midnight Date object so that day
 * differences are computed without timezone artefacts.
 */
function parseIsoDate(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBetween(from: string, to: string): number {
  const msPerDay = 86_400_000;
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / msPerDay);
}

// ── Service ───────────────────────────────────────────────────────────────────

export class QueryTrackerService {
  constructor(private readonly client: MCPClient) {}

  /**
   * Record a new agent query submission.
   *
   * @param projectId  - The owning project id
   * @param agentName  - Agent's full name (e.g. "Jane Smith")
   * @param opts       - Optional agency, query date, materials sent, and notes
   * @returns          The persisted AgentQuery record
   */
  async addQuery(
    projectId: string,
    agentName: string,
    opts: {
      agency?: string;
      queryDate?: string;
      materialsSent?: string[];
      notes?: string;
    } = {}
  ): Promise<AgentQuery> {
    const now = new Date().toISOString();
    const query: AgentQuery = {
      id: generateId(),
      projectId,
      agentName: agentName.trim(),
      agency: opts.agency?.trim(),
      queryDate: opts.queryDate ?? now.slice(0, 10), // YYYY-MM-DD
      status: 'sent',
      notes: opts.notes,
      materialsSent: opts.materialsSent ?? [],
      createdAt: now,
      updatedAt: now,
    };

    await this.client.writeQuery(
      `INSERT INTO agent_queries
         (id, project_id, agent_name, agency, query_date, status,
          response_date, notes, materials_sent, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        query.id,
        query.projectId,
        query.agentName,
        query.agency ?? null,
        query.queryDate,
        query.status,
        null,
        query.notes ?? null,
        JSON.stringify(query.materialsSent),
        query.createdAt,
        query.updatedAt,
      ]
    );

    return query;
  }

  /**
   * Return all agent queries for a project, optionally filtered by status.
   *
   * @param projectId - The owning project id
   * @param filter    - Optional status filter
   */
  async listQueries(
    projectId: string,
    filter?: { status?: QueryStatus }
  ): Promise<AgentQuery[]> {
    let sql = 'SELECT * FROM agent_queries WHERE project_id = ?';
    const params: string[] = [projectId];

    if (filter?.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }

    sql += ' ORDER BY query_date DESC, created_at DESC';

    const rows = (await this.client.readQuery(sql, params)) as AgentQueryRow[];
    return rows.map(rowToQuery);
  }

  /**
   * Update mutable fields on an existing query record.
   * `updatedAt` is always refreshed.
   *
   * @param id     - Primary key of the record to update
   * @param fields - Partial patch of status, responseDate, and/or notes
   */
  async updateQuery(
    id: string,
    fields: Partial<Pick<AgentQuery, 'status' | 'responseDate' | 'notes'>>
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const now = new Date().toISOString();

    if (fields.status !== undefined) {
      sets.push('status = ?');
      params.push(fields.status);
    }
    if (fields.responseDate !== undefined) {
      sets.push('response_date = ?');
      params.push(fields.responseDate ?? null);
    }
    if (fields.notes !== undefined) {
      sets.push('notes = ?');
      params.push(fields.notes ?? null);
    }

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    params.push(now);
    params.push(id);

    await this.client.writeQuery(
      `UPDATE agent_queries SET ${sets.join(', ')} WHERE id = ?`,
      params as string[]
    );
  }

  /**
   * Compute aggregate statistics for all queries in a project.
   *
   * - `byStatus` counts every QueryStatus (0 if none found)
   * - `avgResponseDays` is the mean calendar days from queryDate → responseDate
   *   for queries that have a responseDate set; null otherwise
   * - `successRate` is (partial_request + full_request + offer) / total; null if total === 0
   */
  async getStats(projectId: string): Promise<QueryStats> {
    const rows = (await this.client.readQuery(
      'SELECT * FROM agent_queries WHERE project_id = ?',
      [projectId]
    )) as AgentQueryRow[];

    const queries = rows.map(rowToQuery);

    // Initialise all statuses to 0
    const byStatus = Object.fromEntries(
      ALL_STATUSES.map((s) => [s, 0])
    ) as Record<QueryStatus, number>;

    for (const q of queries) {
      byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
    }

    const total = queries.length;

    // Average response days
    const withResponse = queries.filter((q) => q.responseDate);
    let avgResponseDays: number | null = null;
    if (withResponse.length > 0) {
      const sumDays = withResponse.reduce(
        (acc, q) => acc + daysBetween(q.queryDate, q.responseDate!),
        0
      );
      avgResponseDays = Math.round(sumDays / withResponse.length);
    }

    // Success rate
    let successRate: number | null = null;
    if (total > 0) {
      const successCount = SUCCESS_STATUSES.reduce(
        (acc, s) => acc + byStatus[s],
        0
      );
      successRate = successCount / total;
    }

    return { total, byStatus, avgResponseDays, successRate };
  }

  /**
   * Build a query package directory under `<projectPath>/export/query-package/`
   * containing an `<AGENT_NAME>-query.md` template file.
   *
   * The template includes:
   * - A query letter placeholder header
   * - The first 500 words of `export/synopsis-short.md` (if it exists)
   * - The first 10 non-empty paragraphs from the first chapter file (if found)
   *
   * @param projectId   - The owning project id (used for query lookup)
   * @param projectPath - Absolute path to the novel project directory
   * @param agentName   - Name of the agent; used to derive the filename
   * @returns           The absolute path to the created `.md` file
   */
  async exportQueryPackage(
    projectId: string,
    projectPath: string,
    agentName: string
  ): Promise<string> {
    // Determine query package directory
    const exportDir = join(projectPath, 'export', 'query-package');
    await mkdir(exportDir, { recursive: true });

    // Derive a safe filename from the agent name
    const safeAgentName = agentName
      .trim()
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');

    const filePath = join(exportDir, `${safeAgentName}-query.md`);

    // ── Synopsis (first 500 words) ────────────────────────────────────────────
    let synopsisBlock = '_[Paste synopsis here — synopsis-short.md not found]_';
    const synopsisPath = join(projectPath, 'export', 'synopsis-short.md');
    try {
      const synopsisContent = await readFile(synopsisPath, 'utf-8');
      const words = synopsisContent.trim().split(/\s+/);
      const excerpt = words.slice(0, 500).join(' ');
      synopsisBlock =
        words.length > 500
          ? `${excerpt} …\n\n_[truncated to 500 words — see synopsis-short.md for full version]_`
          : excerpt;
    } catch {
      // File does not exist — use placeholder
    }

    // ── First pages (first 10 paragraphs of chapter 1) ────────────────────────
    let firstPagesBlock = '_[First pages not found — no chapter files present]_';
    const chaptersDir = join(projectPath, 'chapters');
    try {
      const { readdir } = await import('fs/promises');
      const entries = await readdir(chaptersDir);
      const chapterFiles = entries
        .filter((f) => /\.(md|markdown)$/i.test(f))
        .sort();

      if (chapterFiles.length > 0) {
        const chapterPath = join(chaptersDir, chapterFiles[0]);
        const chapterContent = await readFile(chapterPath, 'utf-8');

        // Split on double newlines to get paragraphs; skip YAML frontmatter
        const stripped = chapterContent.replace(/^---[\s\S]*?---\n?/, '').trim();
        const paragraphs = stripped
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0);

        const firstTen = paragraphs.slice(0, 10).join('\n\n');
        firstPagesBlock = firstTen || '_[Chapter file contains no paragraphs]_';
      }
    } catch {
      // chapters directory missing or unreadable — use placeholder
    }

    // ── Assemble document ─────────────────────────────────────────────────────
    const now = new Date().toISOString().slice(0, 10);
    const content = [
      `# Query Package — ${agentName}`,
      '',
      `> Generated: ${now} | Project ID: ${projectId}`,
      '',
      '---',
      '',
      '## Query Letter',
      '',
      '_[Paste your personalised query letter here]_',
      '',
      '---',
      '',
      '## Synopsis',
      '',
      synopsisBlock,
      '',
      '---',
      '',
      '## First Pages',
      '',
      firstPagesBlock,
      '',
    ].join('\n');

    await writeFile(filePath, content, 'utf-8');
    return filePath;
  }
}
