import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────

interface SqlQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  sql: string;
}

interface SqlValidationResult {
  valid: boolean;
  errors: string[];
}

interface SqlExplainResult {
  operations: SqlOperation[];
  estimatedRowCount: number;
  referencedTables: string[];
  referencedColumns: string[];
  hasAggregation: boolean;
  hasJoin: boolean;
  hasSubquery: boolean;
}

interface SqlOperation {
  type: string;
  description: string;
  estimatedCost: number;
}

interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  tenantId: string;
  userId: string;
  createdAt: Date;
  lastRunAt: Date | null;
  runCount: number;
}

// ─── Token types ───────────────────────────────────────────────────

type TokenType =
  | 'KEYWORD'
  | 'IDENTIFIER'
  | 'NUMBER'
  | 'STRING'
  | 'OPERATOR'
  | 'COMMA'
  | 'DOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'STAR'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

// ─── Parsed SQL AST ────────────────────────────────────────────────

interface SelectColumn {
  expression: string;
  alias: string | null;
  isAggregate: boolean;
  aggregateFunction: string | null;
  columnName: string | null;
}

interface WhereCondition {
  column: string;
  operator: string;
  value: unknown;
  logicalOp: 'AND' | 'OR' | null;
  isNot: boolean;
}

interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
  table: string;
  alias: string | null;
  onLeft: string;
  onRight: string;
}

interface OrderByClause {
  column: string;
  direction: 'ASC' | 'DESC';
}

interface GroupByClause {
  columns: string[];
}

interface HavingCondition {
  expression: string;
  aggregateFunction: string;
  column: string;
  operator: string;
  value: unknown;
}

interface ParsedQuery {
  type: 'SELECT';
  distinct: boolean;
  columns: SelectColumn[];
  from: { table: string; alias: string | null };
  joins: JoinClause[];
  where: WhereCondition[];
  groupBy: GroupByClause | null;
  having: HavingCondition[];
  orderBy: OrderByClause[];
  limit: number | null;
  offset: number | null;
}

// ─── SQL Keywords ──────────────────────────────────────────────────

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'ORDER',
  'LIMIT', 'OFFSET', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL',
  'OUTER', 'CROSS', 'ON', 'AS', 'AND', 'OR', 'NOT', 'IN',
  'BETWEEN', 'LIKE', 'IS', 'NULL', 'DISTINCT', 'ASC', 'DESC',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'TRUE', 'FALSE',
]);

const AGGREGATE_FUNCTIONS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);

// ─── Tokenizer ─────────────────────────────────────────────────────

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  const input = sql.trim();

  while (pos < input.length) {
    // Skip whitespace
    if (/\s/.test(input[pos])) {
      pos++;
      continue;
    }

    // Single-line comments
    if (input[pos] === '-' && input[pos + 1] === '-') {
      while (pos < input.length && input[pos] !== '\n') pos++;
      continue;
    }

    // String literals
    if (input[pos] === "'") {
      const start = pos;
      pos++;
      let value = '';
      while (pos < input.length) {
        if (input[pos] === "'" && input[pos + 1] === "'") {
          value += "'";
          pos += 2;
        } else if (input[pos] === "'") {
          pos++;
          break;
        } else {
          value += input[pos];
          pos++;
        }
      }
      tokens.push({ type: 'STRING', value, position: start });
      continue;
    }

    // Numbers
    if (/\d/.test(input[pos]) || (input[pos] === '.' && pos + 1 < input.length && /\d/.test(input[pos + 1]))) {
      const start = pos;
      let numStr = '';
      while (pos < input.length && (/\d/.test(input[pos]) || input[pos] === '.')) {
        numStr += input[pos];
        pos++;
      }
      tokens.push({ type: 'NUMBER', value: numStr, position: start });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_\u0600-\u06FF]/.test(input[pos])) {
      const start = pos;
      let ident = '';
      while (pos < input.length && /[a-zA-Z0-9_\u0600-\u06FF]/.test(input[pos])) {
        ident += input[pos];
        pos++;
      }
      const upper = ident.toUpperCase();
      if (SQL_KEYWORDS.has(upper)) {
        tokens.push({ type: 'KEYWORD', value: upper, position: start });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: ident, position: start });
      }
      continue;
    }

    // Quoted identifiers
    if (input[pos] === '"' || input[pos] === '`') {
      const quote = input[pos];
      const start = pos;
      pos++;
      let ident = '';
      while (pos < input.length && input[pos] !== quote) {
        ident += input[pos];
        pos++;
      }
      if (pos < input.length) pos++;
      tokens.push({ type: 'IDENTIFIER', value: ident, position: start });
      continue;
    }

    // Operators
    const twoChar = input.substring(pos, pos + 2);
    if (['<=', '>=', '<>', '!='].includes(twoChar)) {
      tokens.push({ type: 'OPERATOR', value: twoChar === '!=' ? '<>' : twoChar, position: pos });
      pos += 2;
      continue;
    }

    if (['=', '<', '>'].includes(input[pos])) {
      tokens.push({ type: 'OPERATOR', value: input[pos], position: pos });
      pos++;
      continue;
    }

    // Punctuation
    const punctMap: Record<string, TokenType> = {
      ',': 'COMMA',
      '.': 'DOT',
      '(': 'LPAREN',
      ')': 'RPAREN',
      '*': 'STAR',
    };

    if (punctMap[input[pos]]) {
      tokens.push({ type: punctMap[input[pos]], value: input[pos], position: pos });
      pos++;
      continue;
    }

    // Skip unknown characters
    pos++;
  }

  tokens.push({ type: 'EOF', value: '', position: pos });
  return tokens;
}

// ─── Parser ────────────────────────────────────────────────────────

class SqlParser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private current(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: '', position: -1 };
  }

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] || { type: 'EOF', value: '', position: -1 };
  }

  private advance(): Token {
    const tok = this.current();
    this.pos++;
    return tok;
  }

  private expect(type: TokenType, value?: string): Token {
    const tok = this.current();
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw new Error(`Expected ${type}${value ? ` '${value}'` : ''} at position ${tok.position}, got ${tok.type} '${tok.value}'`);
    }
    return this.advance();
  }

  private matchKeyword(keyword: string): boolean {
    return this.current().type === 'KEYWORD' && this.current().value === keyword;
  }

  private consumeKeyword(keyword: string): boolean {
    if (this.matchKeyword(keyword)) {
      this.advance();
      return true;
    }
    return false;
  }

  parse(): ParsedQuery {
    this.expect('KEYWORD', 'SELECT');

    const distinct = this.consumeKeyword('DISTINCT');
    const columns = this.parseSelectColumns();

    this.expect('KEYWORD', 'FROM');
    const from = this.parseTableReference();

    const joins = this.parseJoins();
    const where = this.parseWhere();
    const groupBy = this.parseGroupBy();
    const having = this.parseHaving();
    const orderBy = this.parseOrderBy();
    const { limit, offset } = this.parseLimitOffset();

    return {
      type: 'SELECT',
      distinct,
      columns,
      from,
      joins,
      where,
      groupBy,
      having,
      orderBy,
      limit,
      offset,
    };
  }

  private parseSelectColumns(): SelectColumn[] {
    const columns: SelectColumn[] = [];

    if (this.current().type === 'STAR') {
      this.advance();
      columns.push({
        expression: '*',
        alias: null,
        isAggregate: false,
        aggregateFunction: null,
        columnName: '*',
      });
      while (this.current().type === 'COMMA') {
        this.advance();
        columns.push(this.parseSelectColumn());
      }
      return columns;
    }

    columns.push(this.parseSelectColumn());
    while (this.current().type === 'COMMA') {
      this.advance();
      columns.push(this.parseSelectColumn());
    }
    return columns;
  }

  private parseSelectColumn(): SelectColumn {
    const cur = this.current();

    // Aggregate functions
    if (cur.type === 'KEYWORD' && AGGREGATE_FUNCTIONS.has(cur.value)) {
      const func = this.advance().value;
      this.expect('LPAREN');

      let innerCol = '*';
      if (this.current().type === 'STAR') {
        this.advance();
      } else if (this.current().type === 'KEYWORD' && this.current().value === 'DISTINCT') {
        this.advance();
        innerCol = 'DISTINCT ' + this.advance().value;
      } else {
        innerCol = this.advance().value;
      }
      this.expect('RPAREN');

      let alias: string | null = null;
      if (this.consumeKeyword('AS')) {
        alias = this.advance().value;
      } else if (this.current().type === 'IDENTIFIER') {
        alias = this.advance().value;
      }

      return {
        expression: `${func}(${innerCol})`,
        alias,
        isAggregate: true,
        aggregateFunction: func,
        columnName: innerCol === '*' ? null : innerCol.replace('DISTINCT ', ''),
      };
    }

    // Regular column (possibly table.column)
    let colName = this.advance().value;
    if (this.current().type === 'DOT') {
      this.advance();
      colName = colName + '.' + this.advance().value;
    }

    let alias: string | null = null;
    if (this.consumeKeyword('AS')) {
      alias = this.advance().value;
    } else if (
      this.current().type === 'IDENTIFIER' &&
      !this.matchKeyword('FROM') &&
      !this.matchKeyword('WHERE')
    ) {
      alias = this.advance().value;
    }

    return {
      expression: colName,
      alias,
      isAggregate: false,
      aggregateFunction: null,
      columnName: colName,
    };
  }

  private parseTableReference(): { table: string; alias: string | null } {
    const table = this.advance().value;
    let alias: string | null = null;
    if (this.consumeKeyword('AS')) {
      alias = this.advance().value;
    } else if (
      this.current().type === 'IDENTIFIER' &&
      !['WHERE', 'GROUP', 'ORDER', 'LIMIT', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'HAVING', 'ON'].includes(this.current().value.toUpperCase())
    ) {
      alias = this.advance().value;
    }
    return { table, alias };
  }

  private parseJoins(): JoinClause[] {
    const joins: JoinClause[] = [];
    while (true) {
      let joinType: JoinClause['type'] | null = null;
      if (this.consumeKeyword('INNER')) {
        this.expect('KEYWORD', 'JOIN');
        joinType = 'INNER';
      } else if (this.consumeKeyword('LEFT')) {
        this.consumeKeyword('OUTER');
        this.expect('KEYWORD', 'JOIN');
        joinType = 'LEFT';
      } else if (this.consumeKeyword('RIGHT')) {
        this.consumeKeyword('OUTER');
        this.expect('KEYWORD', 'JOIN');
        joinType = 'RIGHT';
      } else if (this.consumeKeyword('FULL')) {
        this.consumeKeyword('OUTER');
        this.expect('KEYWORD', 'JOIN');
        joinType = 'FULL';
      } else if (this.consumeKeyword('CROSS')) {
        this.expect('KEYWORD', 'JOIN');
        joinType = 'CROSS';
      } else if (this.matchKeyword('JOIN')) {
        this.advance();
        joinType = 'INNER';
      }

      if (!joinType) break;

      const ref = this.parseTableReference();
      let onLeft = '';
      let onRight = '';

      if (joinType !== 'CROSS') {
        this.expect('KEYWORD', 'ON');
        onLeft = this.advance().value;
        if (this.current().type === 'DOT') {
          this.advance();
          onLeft += '.' + this.advance().value;
        }
        this.expect('OPERATOR', '=');
        onRight = this.advance().value;
        if (this.current().type === 'DOT') {
          this.advance();
          onRight += '.' + this.advance().value;
        }
      }

      joins.push({
        type: joinType,
        table: ref.table,
        alias: ref.alias,
        onLeft,
        onRight,
      });
    }
    return joins;
  }

  private parseWhere(): WhereCondition[] {
    if (!this.consumeKeyword('WHERE')) return [];
    return this.parseConditions();
  }

  private parseConditions(): WhereCondition[] {
    const conditions: WhereCondition[] = [];
    conditions.push(this.parseSingleCondition(null));

    while (this.matchKeyword('AND') || this.matchKeyword('OR')) {
      const logicalOp = this.advance().value as 'AND' | 'OR';
      conditions.push(this.parseSingleCondition(logicalOp));
    }

    return conditions;
  }

  private parseSingleCondition(logicalOp: 'AND' | 'OR' | null): WhereCondition {
    const isNot = this.consumeKeyword('NOT');

    let column = this.advance().value;
    if (this.current().type === 'DOT') {
      this.advance();
      column += '.' + this.advance().value;
    }

    // IS NULL / IS NOT NULL
    if (this.matchKeyword('IS')) {
      this.advance();
      const not = this.consumeKeyword('NOT');
      this.expect('KEYWORD', 'NULL');
      return {
        column,
        operator: not ? 'IS NOT NULL' : 'IS NULL',
        value: null,
        logicalOp,
        isNot,
      };
    }

    // BETWEEN
    if (this.matchKeyword('BETWEEN')) {
      this.advance();
      const low = this.parseValue();
      this.expect('KEYWORD', 'AND');
      const high = this.parseValue();
      return {
        column,
        operator: 'BETWEEN',
        value: [low, high],
        logicalOp,
        isNot,
      };
    }

    // IN
    if (this.matchKeyword('IN')) {
      this.advance();
      this.expect('LPAREN');
      const values: unknown[] = [];
      values.push(this.parseValue());
      while (this.current().type === 'COMMA') {
        this.advance();
        values.push(this.parseValue());
      }
      this.expect('RPAREN');
      return {
        column,
        operator: 'IN',
        value: values,
        logicalOp,
        isNot,
      };
    }

    // LIKE
    if (this.matchKeyword('LIKE')) {
      this.advance();
      const pattern = this.parseValue();
      return {
        column,
        operator: 'LIKE',
        value: pattern,
        logicalOp,
        isNot,
      };
    }

    // Standard comparison operators
    const op = this.expect('OPERATOR').value;
    const value = this.parseValue();
    return {
      column,
      operator: op,
      value,
      logicalOp,
      isNot,
    };
  }

  private parseValue(): unknown {
    const tok = this.current();
    if (tok.type === 'STRING') {
      this.advance();
      return tok.value;
    }
    if (tok.type === 'NUMBER') {
      this.advance();
      return tok.value.includes('.') ? parseFloat(tok.value) : parseInt(tok.value, 10);
    }
    if (tok.type === 'KEYWORD' && tok.value === 'NULL') {
      this.advance();
      return null;
    }
    if (tok.type === 'KEYWORD' && tok.value === 'TRUE') {
      this.advance();
      return true;
    }
    if (tok.type === 'KEYWORD' && tok.value === 'FALSE') {
      this.advance();
      return false;
    }
    // Treat identifier as string value (column reference)
    if (tok.type === 'IDENTIFIER') {
      this.advance();
      return tok.value;
    }
    throw new Error(`Unexpected value token at position ${tok.position}: ${tok.type} '${tok.value}'`);
  }

  private parseGroupBy(): GroupByClause | null {
    if (!this.consumeKeyword('GROUP')) return null;
    this.expect('KEYWORD', 'BY');
    const columns: string[] = [];
    columns.push(this.advance().value);
    while (this.current().type === 'COMMA') {
      this.advance();
      columns.push(this.advance().value);
    }
    return { columns };
  }

  private parseHaving(): HavingCondition[] {
    if (!this.consumeKeyword('HAVING')) return [];
    const conditions: HavingCondition[] = [];
    conditions.push(this.parseHavingCondition());
    while (this.matchKeyword('AND') || this.matchKeyword('OR')) {
      this.advance();
      conditions.push(this.parseHavingCondition());
    }
    return conditions;
  }

  private parseHavingCondition(): HavingCondition {
    const func = this.expect('KEYWORD').value;
    this.expect('LPAREN');
    let col = '*';
    if (this.current().type === 'STAR') {
      this.advance();
    } else {
      col = this.advance().value;
    }
    this.expect('RPAREN');
    const op = this.expect('OPERATOR').value;
    const val = this.parseValue();

    return {
      expression: `${func}(${col})`,
      aggregateFunction: func,
      column: col,
      operator: op,
      value: val,
    };
  }

  private parseOrderBy(): OrderByClause[] {
    if (!this.consumeKeyword('ORDER')) return [];
    this.expect('KEYWORD', 'BY');
    const clauses: OrderByClause[] = [];

    const col = this.advance().value;
    let dir: 'ASC' | 'DESC' = 'ASC';
    if (this.consumeKeyword('DESC')) dir = 'DESC';
    else this.consumeKeyword('ASC');
    clauses.push({ column: col, direction: dir });

    while (this.current().type === 'COMMA') {
      this.advance();
      const c = this.advance().value;
      let d: 'ASC' | 'DESC' = 'ASC';
      if (this.consumeKeyword('DESC')) d = 'DESC';
      else this.consumeKeyword('ASC');
      clauses.push({ column: c, direction: d });
    }
    return clauses;
  }

  private parseLimitOffset(): { limit: number | null; offset: number | null } {
    let limit: number | null = null;
    let offset: number | null = null;

    if (this.consumeKeyword('LIMIT')) {
      const tok = this.expect('NUMBER');
      limit = parseInt(tok.value, 10);
    }
    if (this.consumeKeyword('OFFSET')) {
      const tok = this.expect('NUMBER');
      offset = parseInt(tok.value, 10);
    }
    return { limit, offset };
  }
}

// ─── Query Executor ────────────────────────────────────────────────

class QueryExecutor {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async execute(parsed: ParsedQuery, tenantId: string): Promise<SqlQueryResult> {
    const startTime = Date.now();

    // Resolve the main table (dataset)
    const mainDataset = await this.resolveDataset(parsed.from.table, tenantId);
    const mainAlias = parsed.from.alias || parsed.from.table;

    // Load main dataset rows
    let mainRows = await this.loadDatasetRows(mainDataset.id);

    // Process JOINs
    for (const join of parsed.joins) {
      const joinDataset = await this.resolveDataset(join.table, tenantId);
      const joinRows = await this.loadDatasetRows(joinDataset.id);
      const joinAlias = join.alias || join.table;
      mainRows = this.performJoin(mainRows, joinRows, join, mainAlias, joinAlias);
    }

    // Apply WHERE
    if (parsed.where.length > 0) {
      mainRows = this.applyWhere(mainRows, parsed.where);
    }

    // Apply DISTINCT (before grouping if no aggregation)
    const hasAggregation = parsed.columns.some(c => c.isAggregate);

    // Apply GROUP BY + aggregation
    if (parsed.groupBy || hasAggregation) {
      mainRows = this.applyGroupBy(mainRows, parsed.groupBy, parsed.columns);
    }

    // Apply HAVING
    if (parsed.having.length > 0) {
      mainRows = this.applyHaving(mainRows, parsed.having);
    }

    // Project columns
    if (!hasAggregation && !(parsed.columns.length === 1 && parsed.columns[0].expression === '*')) {
      mainRows = this.projectColumns(mainRows, parsed.columns);
    }

    // Apply DISTINCT
    if (parsed.distinct) {
      mainRows = this.applyDistinct(mainRows);
    }

    // Apply ORDER BY
    if (parsed.orderBy.length > 0) {
      mainRows = this.applyOrderBy(mainRows, parsed.orderBy);
    }

    // Apply OFFSET
    if (parsed.offset !== null && parsed.offset > 0) {
      mainRows = mainRows.slice(parsed.offset);
    }

    // Apply LIMIT
    if (parsed.limit !== null) {
      mainRows = mainRows.slice(0, parsed.limit);
    }

    // Determine column names
    const columns = mainRows.length > 0 ? Object.keys(mainRows[0]) : this.getExpectedColumns(parsed);

    return {
      columns,
      rows: mainRows,
      rowCount: mainRows.length,
      executionTimeMs: Date.now() - startTime,
      sql: '',
    };
  }

  private async resolveDataset(nameOrId: string, tenantId: string): Promise<{ id: string; name: string }> {
    // Try by ID first
    const byId = await this.prisma.dataset.findFirst({
      where: { id: nameOrId, tenantId },
      select: { id: true, name: true },
    });
    if (byId) return byId;

    // Try by name (case-insensitive)
    const byName = await this.prisma.dataset.findFirst({
      where: {
        tenantId,
        name: { equals: nameOrId, mode: 'insensitive' },
        status: 'active',
      },
      select: { id: true, name: true },
    });
    if (byName) return byName;

    // Try by table_name
    const byTableName = await this.prisma.dataset.findFirst({
      where: {
        tenantId,
        tableName: { equals: nameOrId, mode: 'insensitive' },
        status: 'active',
      },
      select: { id: true, name: true },
    });
    if (byTableName) return byTableName;

    throw new Error(`Dataset '${nameOrId}' not found for tenant`);
  }

  private async loadDatasetRows(datasetId: string): Promise<Record<string, unknown>[]> {
    const rows = await this.prisma.dataRow.findMany({
      where: { datasetId },
      orderBy: { rowIndex: 'asc' },
      select: { data: true },
    });
    return rows.map(r => r.data as Record<string, unknown>);
  }

  private performJoin(
    leftRows: Record<string, unknown>[],
    rightRows: Record<string, unknown>[],
    join: JoinClause,
    leftAlias: string,
    rightAlias: string
  ): Record<string, unknown>[] {
    const result: Record<string, unknown>[] = [];
    const leftCol = this.resolveJoinColumn(join.onLeft, leftAlias);
    const rightCol = this.resolveJoinColumn(join.onRight, rightAlias);

    // Build right index for performance
    const rightIndex = new Map<string, Record<string, unknown>[]>();
    for (const rRow of rightRows) {
      const key = String(rRow[rightCol] ?? '').toLowerCase();
      const existing = rightIndex.get(key);
      if (existing) {
        existing.push(rRow);
      } else {
        rightIndex.set(key, [rRow]);
      }
    }

    const rightNullRow: Record<string, unknown> = {};
    if (rightRows.length > 0) {
      for (const key of Object.keys(rightRows[0])) {
        rightNullRow[key] = null;
      }
    }

    const leftNullRow: Record<string, unknown> = {};
    if (leftRows.length > 0) {
      for (const key of Object.keys(leftRows[0])) {
        leftNullRow[key] = null;
      }
    }

    if (join.type === 'CROSS') {
      for (const lRow of leftRows) {
        for (const rRow of rightRows) {
          result.push({ ...lRow, ...this.prefixKeys(rRow, rightAlias) });
        }
      }
      return result;
    }

    const matchedRightKeys = new Set<string>();

    for (const lRow of leftRows) {
      const lKey = String(lRow[leftCol] ?? '').toLowerCase();
      const matches = rightIndex.get(lKey);

      if (matches && matches.length > 0) {
        matchedRightKeys.add(lKey);
        for (const rRow of matches) {
          result.push({ ...lRow, ...rRow });
        }
      } else if (join.type === 'LEFT' || join.type === 'FULL') {
        result.push({ ...lRow, ...rightNullRow });
      }
      // INNER: skip if no match
    }

    // RIGHT / FULL: add unmatched right rows
    if (join.type === 'RIGHT' || join.type === 'FULL') {
      for (const rRow of rightRows) {
        const rKey = String(rRow[rightCol] ?? '').toLowerCase();
        if (!matchedRightKeys.has(rKey)) {
          result.push({ ...leftNullRow, ...rRow });
        }
      }
    }

    return result;
  }

  private resolveJoinColumn(qualifiedName: string, _alias: string): string {
    const parts = qualifiedName.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : qualifiedName;
  }

  private prefixKeys(row: Record<string, unknown>, prefix: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      result[`${prefix}.${key}`] = value;
    }
    return result;
  }

  private applyWhere(
    rows: Record<string, unknown>[],
    conditions: WhereCondition[]
  ): Record<string, unknown>[] {
    return rows.filter(row => {
      let result = this.evaluateCondition(row, conditions[0]);

      for (let i = 1; i < conditions.length; i++) {
        const cond = conditions[i];
        const condResult = this.evaluateCondition(row, cond);

        if (cond.logicalOp === 'OR') {
          result = result || condResult;
        } else {
          result = result && condResult;
        }
      }
      return result;
    });
  }

  private evaluateCondition(row: Record<string, unknown>, cond: WhereCondition): boolean {
    const colName = cond.column.includes('.') ? cond.column.split('.').pop()! : cond.column;
    const cellValue = row[colName];
    let result = false;

    switch (cond.operator) {
      case '=':
        result = this.loosEqual(cellValue, cond.value);
        break;
      case '<>':
        result = !this.loosEqual(cellValue, cond.value);
        break;
      case '<':
        result = this.compareValues(cellValue, cond.value) < 0;
        break;
      case '>':
        result = this.compareValues(cellValue, cond.value) > 0;
        break;
      case '<=':
        result = this.compareValues(cellValue, cond.value) <= 0;
        break;
      case '>=':
        result = this.compareValues(cellValue, cond.value) >= 0;
        break;
      case 'IS NULL':
        result = cellValue === null || cellValue === undefined;
        break;
      case 'IS NOT NULL':
        result = cellValue !== null && cellValue !== undefined;
        break;
      case 'LIKE':
        result = this.matchLike(String(cellValue ?? ''), String(cond.value));
        break;
      case 'IN': {
        const inValues = cond.value as unknown[];
        result = inValues.some(v => this.loosEqual(cellValue, v));
        break;
      }
      case 'BETWEEN': {
        const [low, high] = cond.value as [unknown, unknown];
        result = this.compareValues(cellValue, low) >= 0 && this.compareValues(cellValue, high) <= 0;
        break;
      }
      default:
        result = false;
    }

    return cond.isNot ? !result : result;
  }

  private loosEqual(a: unknown, b: unknown): boolean {
    if (a === null || a === undefined) return b === null || b === undefined;
    if (b === null || b === undefined) return false;
    const strA = String(a).toLowerCase().trim();
    const strB = String(b).toLowerCase().trim();
    if (strA === strB) return true;
    const numA = Number(a);
    const numB = Number(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA === numB;
    return false;
  }

  private compareValues(a: unknown, b: unknown): number {
    if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
    if (b === null || b === undefined) return 1;
    const numA = Number(a);
    const numB = Number(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a).localeCompare(String(b));
  }

  private matchLike(value: string, pattern: string): boolean {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexStr = escaped.replace(/%/g, '.*').replace(/_/g, '.');
    const regex = new RegExp(`^${regexStr}$`, 'i');
    return regex.test(value);
  }

  private applyGroupBy(
    rows: Record<string, unknown>[],
    groupBy: GroupByClause | null,
    selectColumns: SelectColumn[]
  ): Record<string, unknown>[] {
    const groupKeys = groupBy?.columns || [];
    const groups = new Map<string, Record<string, unknown>[]>();

    if (groupKeys.length === 0) {
      groups.set('__all__', rows);
    } else {
      for (const row of rows) {
        const key = groupKeys.map(k => String(row[k] ?? '')).join('|||');
        const existing = groups.get(key);
        if (existing) {
          existing.push(row);
        } else {
          groups.set(key, [row]);
        }
      }
    }

    const result: Record<string, unknown>[] = [];

    for (const [, groupRows] of groups) {
      const outputRow: Record<string, unknown> = {};

      // Copy group-by columns
      if (groupRows.length > 0) {
        for (const gk of groupKeys) {
          outputRow[gk] = groupRows[0][gk];
        }
      }

      // Compute aggregates
      for (const col of selectColumns) {
        if (col.isAggregate && col.aggregateFunction) {
          const outputName = col.alias || col.expression;
          const colName = col.columnName;
          outputRow[outputName] = this.computeAggregate(groupRows, col.aggregateFunction, colName);
        } else if (!groupKeys.includes(col.expression) && col.expression !== '*') {
          const resolvedName = col.alias || col.expression;
          if (groupRows.length > 0 && col.columnName) {
            outputRow[resolvedName] = groupRows[0][col.columnName];
          }
        }
      }

      result.push(outputRow);
    }

    return result;
  }

  private computeAggregate(rows: Record<string, unknown>[], func: string, column: string | null): unknown {
    switch (func) {
      case 'COUNT': {
        if (column === null || column === '*') return rows.length;
        return rows.filter(r => r[column] !== null && r[column] !== undefined).length;
      }
      case 'SUM': {
        if (!column) return 0;
        let sum = 0;
        for (const r of rows) {
          const v = Number(r[column]);
          if (!isNaN(v)) sum += v;
        }
        return sum;
      }
      case 'AVG': {
        if (!column) return 0;
        let total = 0;
        let count = 0;
        for (const r of rows) {
          const v = Number(r[column]);
          if (!isNaN(v)) {
            total += v;
            count++;
          }
        }
        return count > 0 ? total / count : 0;
      }
      case 'MIN': {
        if (!column) return null;
        let minVal: unknown = null;
        for (const r of rows) {
          const v = r[column];
          if (v !== null && v !== undefined) {
            if (minVal === null || this.compareValues(v, minVal) < 0) {
              minVal = v;
            }
          }
        }
        return minVal;
      }
      case 'MAX': {
        if (!column) return null;
        let maxVal: unknown = null;
        for (const r of rows) {
          const v = r[column];
          if (v !== null && v !== undefined) {
            if (maxVal === null || this.compareValues(v, maxVal) > 0) {
              maxVal = v;
            }
          }
        }
        return maxVal;
      }
      default:
        return null;
    }
  }

  private applyHaving(
    rows: Record<string, unknown>[],
    having: HavingCondition[]
  ): Record<string, unknown>[] {
    return rows.filter(row => {
      return having.every(h => {
        const outputKey = h.expression;
        const value = row[outputKey];
        const compareTo = h.value;
        switch (h.operator) {
          case '=': return this.loosEqual(value, compareTo);
          case '<>': return !this.loosEqual(value, compareTo);
          case '<': return this.compareValues(value, compareTo) < 0;
          case '>': return this.compareValues(value, compareTo) > 0;
          case '<=': return this.compareValues(value, compareTo) <= 0;
          case '>=': return this.compareValues(value, compareTo) >= 0;
          default: return true;
        }
      });
    });
  }

  private projectColumns(
    rows: Record<string, unknown>[],
    columns: SelectColumn[]
  ): Record<string, unknown>[] {
    return rows.map(row => {
      const projected: Record<string, unknown> = {};
      for (const col of columns) {
        const outputName = col.alias || col.expression;
        const sourceName = col.columnName || col.expression;
        projected[outputName] = row[sourceName] ?? row[col.expression] ?? null;
      }
      return projected;
    });
  }

  private applyDistinct(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    const seen = new Set<string>();
    const result: Record<string, unknown>[] = [];
    for (const row of rows) {
      const key = JSON.stringify(row);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(row);
      }
    }
    return result;
  }

  private applyOrderBy(
    rows: Record<string, unknown>[],
    orderBy: OrderByClause[]
  ): Record<string, unknown>[] {
    return [...rows].sort((a, b) => {
      for (const ob of orderBy) {
        const cmp = this.compareValues(a[ob.column], b[ob.column]);
        if (cmp !== 0) return ob.direction === 'DESC' ? -cmp : cmp;
      }
      return 0;
    });
  }

  private getExpectedColumns(parsed: ParsedQuery): string[] {
    if (parsed.columns.length === 1 && parsed.columns[0].expression === '*') {
      return [];
    }
    return parsed.columns.map(c => c.alias || c.expression);
  }
}

// ─── Service ───────────────────────────────────────────────────────

export class SqlQueryEngineService {
  private prisma: PrismaClient;
  private executor: QueryExecutor;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.executor = new QueryExecutor(prisma);
  }

  async executeQuery(sql: string, tenantId: string): Promise<SqlQueryResult> {
    logger.info('Executing SQL query', { tenantId, sqlLength: sql.length });

    const validation = this.validateQuerySync(sql);
    if (!validation.valid) {
      throw new Error(`SQL validation failed: ${validation.errors.join('; ')}`);
    }

    const tokens = tokenize(sql);
    const parser = new SqlParser(tokens);
    const parsed = parser.parse();

    const result = await this.executor.execute(parsed, tenantId);
    result.sql = sql;

    // Audit log
    await this.logAudit(tenantId, 'sql_query_execute', sql);

    logger.info('SQL query executed', {
      tenantId,
      rowCount: result.rowCount,
      executionTimeMs: result.executionTimeMs,
    });

    return result;
  }

  validateQuery(sql: string): SqlValidationResult {
    return this.validateQuerySync(sql);
  }

  private validateQuerySync(sql: string): SqlValidationResult {
    const errors: string[] = [];

    if (!sql || sql.trim().length === 0) {
      errors.push('SQL query is empty');
      return { valid: false, errors };
    }

    const trimmed = sql.trim().toUpperCase();

    // Only allow SELECT statements
    if (!trimmed.startsWith('SELECT')) {
      errors.push('Only SELECT statements are supported');
      return { valid: false, errors };
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /\bDROP\b/i,
      /\bDELETE\b/i,
      /\bUPDATE\b/i,
      /\bINSERT\b/i,
      /\bALTER\b/i,
      /\bTRUNCATE\b/i,
      /\bCREATE\b/i,
      /\bGRANT\b/i,
      /\bREVOKE\b/i,
      /\bEXEC\b/i,
      /\bEXECUTE\b/i,
      /;/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        errors.push(`SQL contains forbidden pattern: ${pattern.source}`);
      }
    }

    // Try to tokenize and parse
    try {
      const tokens = tokenize(sql);
      const parser = new SqlParser(tokens);
      parser.parse();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Parse error: ${message}`);
    }

    return { valid: errors.length === 0, errors };
  }

  async explainQuery(sql: string, tenantId: string): Promise<SqlExplainResult> {
    const validation = this.validateQuerySync(sql);
    if (!validation.valid) {
      throw new Error(`Cannot explain invalid query: ${validation.errors.join('; ')}`);
    }

    const tokens = tokenize(sql);
    const parser = new SqlParser(tokens);
    const parsed = parser.parse();

    const operations: SqlOperation[] = [];
    let estimatedRowCount = 0;

    // Estimate main table row count
    const mainDataset = await this.prisma.dataset.findFirst({
      where: {
        tenantId,
        OR: [
          { name: { equals: parsed.from.table, mode: 'insensitive' } },
          { tableName: { equals: parsed.from.table, mode: 'insensitive' } },
          { id: parsed.from.table },
        ],
      },
      select: { rowCount: true },
    });

    estimatedRowCount = mainDataset?.rowCount ? Number(mainDataset.rowCount) : 0;

    operations.push({
      type: 'TABLE_SCAN',
      description: `Full scan of table '${parsed.from.table}'`,
      estimatedCost: estimatedRowCount,
    });

    for (const join of parsed.joins) {
      operations.push({
        type: `${join.type}_JOIN`,
        description: `${join.type} JOIN with '${join.table}' on ${join.onLeft} = ${join.onRight}`,
        estimatedCost: estimatedRowCount * 2,
      });
    }

    if (parsed.where.length > 0) {
      operations.push({
        type: 'FILTER',
        description: `Apply ${parsed.where.length} WHERE condition(s)`,
        estimatedCost: estimatedRowCount,
      });
      estimatedRowCount = Math.ceil(estimatedRowCount * 0.3);
    }

    if (parsed.groupBy) {
      operations.push({
        type: 'GROUP_BY',
        description: `Group by ${parsed.groupBy.columns.join(', ')}`,
        estimatedCost: estimatedRowCount,
      });
      estimatedRowCount = Math.ceil(estimatedRowCount * 0.1);
    }

    if (parsed.orderBy.length > 0) {
      operations.push({
        type: 'SORT',
        description: `Sort by ${parsed.orderBy.map(o => `${o.column} ${o.direction}`).join(', ')}`,
        estimatedCost: Math.ceil(estimatedRowCount * Math.log2(Math.max(estimatedRowCount, 1))),
      });
    }

    if (parsed.limit !== null) {
      operations.push({
        type: 'LIMIT',
        description: `Limit to ${parsed.limit} rows`,
        estimatedCost: 1,
      });
      estimatedRowCount = Math.min(estimatedRowCount, parsed.limit);
    }

    const referencedTables = [parsed.from.table, ...parsed.joins.map(j => j.table)];
    const referencedColumns = parsed.columns
      .filter(c => c.columnName && c.columnName !== '*')
      .map(c => c.columnName!);

    return {
      operations,
      estimatedRowCount,
      referencedTables,
      referencedColumns,
      hasAggregation: parsed.columns.some(c => c.isAggregate),
      hasJoin: parsed.joins.length > 0,
      hasSubquery: false,
    };
  }

  async getSavedQueries(tenantId: string): Promise<SavedQuery[]> {
    const queries = await this.prisma.metadata.findMany({
      where: {
        tenantId,
        entityType: 'dataset',
        key: { startsWith: 'saved_query_' },
      },
      orderBy: { createdAt: 'desc' },
    });

    return queries.map(q => {
      const data = typeof q.value === 'string' ? JSON.parse(q.value) as Record<string, unknown> : {};
      return {
        id: q.id,
        name: String(data.name || ''),
        sql: String(data.sql || ''),
        tenantId: q.tenantId,
        userId: String(data.userId || ''),
        createdAt: q.createdAt,
        lastRunAt: data.lastRunAt ? new Date(String(data.lastRunAt)) : null,
        runCount: typeof data.runCount === 'number' ? data.runCount : 0,
      };
    });
  }

  async saveQuery(name: string, sql: string, tenantId: string, userId: string): Promise<SavedQuery> {
    const validation = this.validateQuerySync(sql);
    if (!validation.valid) {
      throw new Error(`Cannot save invalid query: ${validation.errors.join('; ')}`);
    }

    const queryId = crypto.randomUUID();
    const now = new Date();

    const saved = await this.prisma.metadata.create({
      data: {
        id: queryId,
        tenantId,
        entityType: 'dataset',
        entityId: queryId,
        key: `saved_query_${queryId}`,
        value: JSON.stringify({
          name,
          sql,
          userId,
          lastRunAt: null,
          runCount: 0,
        }),
        dataType: 'json',
      },
    });

    await this.logAudit(tenantId, 'sql_query_save', JSON.stringify({ name, queryId }), userId);

    return {
      id: saved.id,
      name,
      sql,
      tenantId,
      userId,
      createdAt: now,
      lastRunAt: null,
      runCount: 0,
    };
  }

  async deleteQuery(queryId: string, tenantId: string): Promise<{ deleted: boolean }> {
    const existing = await this.prisma.metadata.findFirst({
      where: {
        id: queryId,
        tenantId,
        key: { startsWith: 'saved_query_' },
      },
    });

    if (!existing) {
      throw new Error(`Saved query '${queryId}' not found`);
    }

    await this.prisma.metadata.delete({ where: { id: queryId } });

    await this.logAudit(tenantId, 'sql_query_delete', JSON.stringify({ queryId }));

    return { deleted: true };
  }

  private async logAudit(tenantId: string, action: string, details: string, userId?: string): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          userId: userId || '00000000-0000-0000-0000-000000000000',
          action,
          entityType: 'dataset',
          detailsJson: { action, details, timestamp: new Date().toISOString() },
        },
      });
    } catch (err) {
      logger.warn('Failed to write audit log', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
