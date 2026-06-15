import type { CleanedWhere } from 'better-auth/adapters';
import type { DialectQuirks } from './dialect';

export type Param = string | number | boolean | string[] | number[] | Date | null;

export function quoteId(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function qualified({ schema, model }: { schema?: string; model: string }): string {
  const table = quoteId(model);
  return schema ? `${quoteId(schema)}.${table}` : table;
}

/** Maps a better-auth model field name to its database column name. */
export type GetColumn = (field: string) => string;

export function selectColumns({
  select,
  getColumn,
}: {
  select: string[] | undefined;
  getColumn: GetColumn;
}): string {
  if (!select || select.length === 0) {
    return '*';
  }
  return select.map((field) => quoteId(getColumn(field))).join(', ');
}

/**
 * Renders a single statement's WHERE/SET fragments while collecting bound
 * parameters in order. One instance is created per query.
 */
export class QueryBuilder {
  readonly #params: Param[] = [];
  readonly #quirks: DialectQuirks;
  readonly #getColumn: GetColumn;

  constructor({ quirks, getColumn }: { quirks: DialectQuirks; getColumn: GetColumn }) {
    this.#quirks = quirks;
    this.#getColumn = getColumn;
  }

  placeholder(value: Param): string {
    this.#params.push(value);
    return `$${this.#params.length}`;
  }

  values(): Param[] {
    return this.#params;
  }

  assignments(update: Record<string, unknown>): string[] {
    return Object.entries(update).map(
      ([column, value]) => `${quoteId(column)} = ${this.placeholder(value as Param)}`,
    );
  }

  whereClause(where: CleanedWhere[] | undefined): string {
    if (!where || where.length === 0) {
      return '';
    }
    const [first, ...rest] = where;
    let clause = this.#comparison(first as CleanedWhere);
    for (const condition of rest) {
      const sql = this.#comparison(condition);
      clause = condition.connector === 'OR' ? `${clause} OR ${sql}` : `${clause} AND ${sql}`;
    }
    return ` WHERE ${clause}`;
  }

  #comparison(where: CleanedWhere): string {
    const column = quoteId(this.#getColumn(where.field));
    const insensitive = where.mode === 'insensitive';
    const lhs = insensitive ? this.#quirks.insensitiveColumn(column) : column;
    const bind = (value: Param): string => {
      const placeholder = this.placeholder(value);
      return insensitive && typeof value === 'string' ? `lower(${placeholder})` : placeholder;
    };

    switch (where.operator) {
      case 'eq':
        return where.value === null ? `${column} IS NULL` : `${lhs} = ${bind(where.value)}`;
      case 'ne':
        return where.value === null ? `${column} IS NOT NULL` : `${lhs} <> ${bind(where.value)}`;
      case 'lt':
        return `${column} < ${this.placeholder(where.value)}`;
      case 'lte':
        return `${column} <= ${this.placeholder(where.value)}`;
      case 'gt':
        return `${column} > ${this.placeholder(where.value)}`;
      case 'gte':
        return `${column} >= ${this.placeholder(where.value)}`;
      case 'in':
        return this.#inList({ column, value: where.value, negate: false });
      case 'not_in':
        return this.#inList({ column, value: where.value, negate: true });
      case 'contains':
        return `${lhs} LIKE ${bind(`%${String(where.value)}%`)}`;
      case 'starts_with':
        return `${lhs} LIKE ${bind(`${String(where.value)}%`)}`;
      case 'ends_with':
        return `${lhs} LIKE ${bind(`%${String(where.value)}`)}`;
    }
  }

  // `bun:sql` rejects `= ANY($n)` with a bound array, so `in`/`not_in` expand to
  // a placeholder list. An empty set degrades to a constant: nothing matches
  // `in`, everything matches `not_in`.
  #inList({ column, value, negate }: { column: string; value: Param; negate: boolean }): string {
    const items = Array.isArray(value) ? value : [value];
    if (items.length === 0) {
      return negate ? 'TRUE' : 'FALSE';
    }
    const placeholders = items.map((item) => this.placeholder(item as Param)).join(', ');
    return `${column} ${negate ? 'NOT IN' : 'IN'} (${placeholders})`;
  }
}
