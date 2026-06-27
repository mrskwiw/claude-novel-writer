/**
 * Mock MCP Client for testing
 */

import type { MCPClient } from '../../project/src/core/database.js';

export class MockMCPClient implements MCPClient {
  private data: Map<string, any[]> = new Map();
  private idCounters: Map<string, number> = new Map();
  private lastInsertId: number = 0;

  async readQuery(query: string, params: any[]): Promise<any[]> {
    // Handle special queries
    if (query.includes('last_insert_rowid()')) {
      return [{ id: this.lastInsertId }];
    }

    // Handle JOIN queries (must check before aggregate, as JOINs can have aggregates)
    if (query.includes('JOIN')) {
      return this.handleJoinQuery(query, params);
    }

    // Handle aggregate queries with GROUP BY
    if (query.includes('GROUP BY')) {
      return this.handleGroupByQuery(query, params);
    }

    // Handle aggregate queries (COUNT, SUM, etc.)
    if (query.includes('COUNT(') || query.includes('SUM(') || query.includes('COALESCE')) {
      return this.handleAggregateQuery(query, params);
    }

    const table = this.extractTableName(query);
    let records = this.data.get(table) || [];

    // Apply WHERE filtering
    if (query.includes('WHERE')) {
      records = this.filterRecords(records, query, params);
    }

    // Apply ORDER BY
    if (query.includes('ORDER BY')) {
      records = this.sortRecords(records, query);
    }

    // Apply LIMIT
    if (query.includes('LIMIT')) {
      const limitMatch = query.match(/LIMIT\s+(\d+)/i);
      if (limitMatch) {
        const limit = parseInt(limitMatch[1]);
        records = records.slice(0, limit);
      }
    }

    // Apply DISTINCT
    if (query.includes('DISTINCT')) {
      const distinctField = this.extractDistinctField(query);
      if (distinctField) {
        const seen = new Set();
        records = records.filter(r => {
          const value = r[distinctField];
          if (seen.has(value)) return false;
          seen.add(value);
          return true;
        });
      }
    }

    return records;
  }

  async writeQuery(query: string, params: any[]): Promise<void> {
    const table = this.extractTableName(query);

    if (query.toUpperCase().includes('INSERT')) {
      this.mockInsert(table, query, params);
    } else if (query.toUpperCase().includes('UPDATE')) {
      this.mockUpdate(table, query, params);
    } else if (query.toUpperCase().includes('DELETE')) {
      this.mockDelete(table, query, params);
    }
  }

  /**
   * Mock INSERT operation with column name parsing
   */
  private mockInsert(table: string, query: string, params: any[]): void {
    const records = this.data.get(table) || [];
    const id = this.getNextId(table);

    // Extract column names from INSERT statement (handle multi-line format)
    // Match from INSERT INTO table_name (...) VALUES
    const columnsMatch = query.match(/\(([^)]+)\)\s*VALUES/is);
    const columns = columnsMatch
      ? columnsMatch[1]
          .split(',')
          .map(c => c.trim())
          .filter(c => c.length > 0)
      : [];

    // Create record with proper column names
    const record: any = { id };

    // Map parameters to columns
    columns.forEach((column, index) => {
      if (index < params.length) {
        record[column] = params[index];
      }
    });

    // Add created_at if not present
    if (!record.created_at) {
      record.created_at = new Date().toISOString();
    }

    records.push(record);
    this.data.set(table, records);
    this.lastInsertId = id;
  }

  /**
   * Mock UPDATE operation with SET clause parsing
   */
  private mockUpdate(table: string, query: string, params: any[]): void {
    const records = this.data.get(table) || [];

    // Extract SET columns
    const setMatch = query.match(/SET\s+(.+?)\s+WHERE/is);
    if (!setMatch) return;

    const setClause = setMatch[1];
    const columns = setClause.split(',').map(s => {
      const parts = s.trim().split('=');
      return parts[0].trim();
    });

    // Filter records to update
    const whereStartIndex = columns.length;
    const whereParams = params.slice(whereStartIndex);
    const filteredRecords = this.filterRecords(records, query, whereParams);

    // Update matched records
    filteredRecords.forEach(record => {
      columns.forEach((column, index) => {
        if (index < params.length) {
          record[column] = params[index];
        }
      });
    });
  }

  /**
   * Mock DELETE operation
   */
  private mockDelete(table: string, query: string, params: any[]): void {
    const records = this.data.get(table) || [];
    const filteredRecords = this.filterRecords(records, query, params);

    // Remove matched records
    const remaining = records.filter((r) => !filteredRecords.includes(r));
    this.data.set(table, remaining);
  }

  /**
   * Handle aggregate queries (COUNT, SUM, AVG, etc.)
   */
  private handleAggregateQuery(query: string, params: any[], preFilteredRecords?: any[]): any[] {
    let records: any[];

    if (preFilteredRecords) {
      // Use pre-filtered records from JOIN
      records = preFilteredRecords;
    } else {
      // Extract and filter records normally
      const table = this.extractTableName(query);
      records = this.data.get(table) || [];

      // Apply WHERE filtering
      if (query.includes('WHERE')) {
        records = this.filterRecords(records, query, params);
      }
    }

    const result: any = {};

    // Handle COUNT
    if (query.includes('COUNT(*)')) {
      const countMatch = query.match(/COUNT\(\*\)\s+as\s+(\w+)/i);
      const alias = countMatch ? countMatch[1] : 'count';
      result[alias] = records.length;
    }

    // Handle SUM
    const sumMatches = query.matchAll(/SUM\((\w+)\)\s+as\s+(\w+)/gi);
    for (const match of sumMatches) {
      const field = match[1];
      const alias = match[2];
      result[alias] = records.reduce((sum, r) => sum + (r[field] || 0), 0);
    }

    // Handle AVG
    const avgMatches = query.matchAll(/AVG\((\w+)\)\s+as\s+(\w+)/gi);
    for (const match of avgMatches) {
      const field = match[1];
      const alias = match[2];
      const values = records.map(r => r[field]).filter(v => v != null);
      result[alias] = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    }

    // Handle COALESCE SUM (for nullable sums)
    const coalesceMatches = query.matchAll(/COALESCE\(SUM\((\w+)\),\s*0\)\s+as\s+(\w+)/gi);
    for (const match of coalesceMatches) {
      const field = match[1];
      const alias = match[2];
      result[alias] = records.reduce((sum, r) => sum + (r[field] || 0), 0);
    }

    // Handle COALESCE AVG (for nullable averages)
    const coalesceAvgMatches = query.matchAll(/COALESCE\(AVG\((\w+)\),\s*0\)\s+as\s+(\w+)/gi);
    for (const match of coalesceAvgMatches) {
      const field = match[1];
      const alias = match[2];
      const values = records.map(r => r[field]).filter(v => v != null);
      result[alias] = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    }

    // Handle complex SUM with CAST (for duration calculations)
    if (query.includes('CAST') && query.includes('julianday')) {
      // Mock duration calculation as 0 for now
      const alias = query.match(/as\s+(\w+)/i)?.[1] || 'total_minutes';
      result[alias] = 0;
    }

    // If no aggregates found, return records
    if (Object.keys(result).length === 0) {
      return records;
    }

    return [result];
  }

  /**
   * Filter records based on WHERE clause
   */
  private filterRecords(
    records: any[],
    query: string,
    params: any[]
  ): any[] {
    // Extract WHERE conditions
    const whereMatch = query.match(/WHERE\s+(.+?)(?:ORDER BY|LIMIT|GROUP BY|$)/is);
    if (!whereMatch) return records;

    const whereClause = whereMatch[1].trim();

    // Parse simple conditions (field = ?)
    const conditions = whereClause.split(/\s+AND\s+/i);
    const fields = conditions.map(c => {
      const match = c.match(/(\w+)\s*[=<>]/);
      return match ? match[1] : null;
    }).filter(Boolean);

    return records.filter((record) => {
      return fields.every((field, index) => {
        if (index >= params.length) return true;

        const param = params[index];
        const recordValue = record[field!];

        // Handle null comparisons
        if (param === null) return recordValue === null;
        if (recordValue === null) return false;

        // Check >= comparisons for dates
        if (conditions[index].includes('>=')) {
          return recordValue >= param;
        }

        // Default equality check
        return recordValue === param;
      });
    });
  }

  /**
   * Sort records based on ORDER BY clause
   */
  private sortRecords(records: any[], query: string): any[] {
    const orderMatch = query.match(/ORDER BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (!orderMatch) return records;

    const field = orderMatch[1];
    const direction = orderMatch[2]?.toUpperCase() || 'ASC';

    return [...records].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (aVal === bVal) return 0;

      const comparison = aVal < bVal ? -1 : 1;
      return direction === 'DESC' ? -comparison : comparison;
    });
  }

  /**
   * Extract DISTINCT field
   */
  private extractDistinctField(query: string): string | null {
    const match = query.match(/SELECT\s+DISTINCT\s+(\w+)/i);
    return match ? match[1] : null;
  }

  /**
   * Extract table name from SQL query
   */
  private extractTableName(query: string): string {
    const match = query.match(
      /(?:FROM|INTO|UPDATE|TABLE)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i
    );
    return match ? match[1] : 'unknown';
  }

  /**
   * Get next auto-increment ID for table
   */
  private getNextId(table: string): number {
    const current = this.idCounters.get(table) || 0;
    const next = current + 1;
    this.idCounters.set(table, next);
    return next;
  }

  /**
   * Test helper: Reset all data
   */
  reset(): void {
    this.data.clear();
    this.idCounters.clear();
  }

  /**
   * Test helper: Seed table with data
   */
  seed(table: string, records: any[]): void {
    this.data.set(table, records);

    // Update ID counter
    const maxId = records.reduce(
      (max, r) => Math.max(max, r.id || 0),
      0
    );
    this.idCounters.set(table, maxId);
  }

  /**
   * Test helper: Get all data from table
   */
  getTableData(table: string): any[] {
    return this.data.get(table) || [];
  }

  /**
   * Test helper: Get record count
   */
  getRecordCount(table: string): number {
    return (this.data.get(table) || []).length;
  }

  /**
   * Handle GROUP BY queries
   */
  private handleGroupByQuery(query: string, params: any[]): any[] {
    const table = this.extractTableName(query);
    let records = this.data.get(table) || [];

    // Apply WHERE filtering
    if (query.includes('WHERE')) {
      records = this.filterRecords(records, query, params);
    }

    // Extract GROUP BY field
    const groupByMatch = query.match(/GROUP BY\s+(\w+)/i);
    if (!groupByMatch) {
      return records;
    }

    const groupField = groupByMatch[1];

    // Group records by field
    const groups = new Map<any, any[]>();
    for (const record of records) {
      const groupValue = record[groupField];
      if (!groups.has(groupValue)) {
        groups.set(groupValue, []);
      }
      groups.get(groupValue)!.push(record);
    }

    // Process aggregates for each group
    const results: any[] = [];

    for (const [groupValue, groupRecords] of groups.entries()) {
      const result: any = {};

      // Add group field
      result[groupField] = groupValue;

      // Handle COUNT
      if (query.includes('COUNT(*)')) {
        const countMatch = query.match(/COUNT\(\*\)\s+as\s+(\w+)/i);
        const alias = countMatch ? countMatch[1] : 'count';
        result[alias] = groupRecords.length;
      }

      // Handle SUM
      const sumMatches = query.matchAll(/SUM\((\w+)\)\s+as\s+(\w+)/gi);
      for (const match of sumMatches) {
        const field = match[1];
        const alias = match[2];
        result[alias] = groupRecords.reduce((sum, r) => sum + (r[field] || 0), 0);
      }

      // Handle AVG
      const avgMatches = query.matchAll(/AVG\((\w+)\)\s+as\s+(\w+)/gi);
      for (const match of avgMatches) {
        const field = match[1];
        const alias = match[2];
        const values = groupRecords.map(r => r[field]).filter(v => v != null);
        result[alias] = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Handle JOIN queries
   */
  private handleJoinQuery(query: string, params: any[]): any[] {
    // Extract table names and aliases
    // Pattern: FROM table1 [alias1] JOIN table2 [alias2] ON ...
    const fromMatch = query.match(/FROM\s+(\w+)(?:\s+(\w+))?/i);
    const joinMatch = query.match(/JOIN\s+(\w+)(?:\s+(\w+))?\s+ON\s+(.+?)(?:WHERE|ORDER|LIMIT|$)/is);

    if (!fromMatch || !joinMatch) {
      return [];
    }

    const table1Name = fromMatch[1];
    const table1Alias = fromMatch[2] || table1Name;
    const table2Name = joinMatch[1];
    const table2Alias = joinMatch[2] || table2Name;
    const joinCondition = joinMatch[3].trim();

    // Get table data
    const table1Data = this.data.get(table1Name) || [];
    const table2Data = this.data.get(table2Name) || [];

    // Parse join condition (e.g., "s.chapter_id = c.id")
    const joinParts = joinCondition.split('=').map(p => p.trim());
    if (joinParts.length !== 2) {
      return [];
    }

    // Extract field names from join condition
    const leftField = joinParts[0].split('.')[1] || joinParts[0];
    const rightField = joinParts[1].split('.')[1] || joinParts[1];

    // Perform join
    const joined: any[] = [];
    for (const row1 of table1Data) {
      for (const row2 of table2Data) {
        if (row1[leftField] === row2[rightField]) {
          // Merge records with table aliases
          const mergedRow: any = {};

          // Add fields from table1 with alias prefix
          for (const key in row1) {
            mergedRow[`${table1Alias}.${key}`] = row1[key];
            mergedRow[key] = row1[key]; // Also add without prefix
          }

          // Add fields from table2 with alias prefix
          for (const key in row2) {
            mergedRow[`${table2Alias}.${key}`] = row2[key];
            // Only add without prefix if not already present
            if (!(key in mergedRow)) {
              mergedRow[key] = row2[key];
            }
          }

          joined.push(mergedRow);
        }
      }
    }

    // Apply WHERE filtering
    let results = joined;
    if (query.includes('WHERE')) {
      results = this.filterRecords(joined, query, params);
    }

    // Apply ORDER BY
    if (query.includes('ORDER BY')) {
      results = this.sortRecords(results, query);
    }

    // Apply LIMIT
    if (query.includes('LIMIT')) {
      const limitMatch = query.match(/LIMIT\s+(\d+)/i);
      if (limitMatch) {
        const limit = parseInt(limitMatch[1]);
        results = results.slice(0, limit);
      }
    }

    // Handle aggregate queries with JOIN
    if (query.includes('COUNT(') || query.includes('SUM(') || query.includes('AVG(') || query.includes('COALESCE')) {
      return this.handleAggregateQuery(query, params, results);
    }

    return results;
  }
}
