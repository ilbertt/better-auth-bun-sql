import type { SQL } from 'bun';

/**
 * The `bun:sql` engines this adapter generates SQL for. `bun:sql` also speaks
 * MySQL/MariaDB, but those lack the `RETURNING` clause this adapter relies on
 * for `create`/`update`, so they are intentionally unsupported.
 */
export type BunSqlDialect = 'postgres' | 'sqlite';

/**
 * The handful of places where Postgres and SQLite diverge in the SQL this
 * adapter emits, plus the better-auth capability flags that depend on the
 * engine's native type support.
 */
export interface DialectQuirks {
  /** SQLite has no native date type, so dates round-trip as ISO strings. */
  supportsDates: boolean;
  /** SQLite has no native boolean type, so booleans round-trip as 0/1. */
  supportsBooleans: boolean;
  /** Postgres needs the `::int` cast; SQLite rejects `::` cast syntax. */
  countExpression: string;
  /** Case-insensitive comparison: Postgres needs a `::text` cast, SQLite does not. */
  insensitiveColumn: (quotedColumn: string) => string;
}

const QUIRKS: Record<BunSqlDialect, DialectQuirks> = {
  postgres: {
    supportsDates: true,
    supportsBooleans: true,
    countExpression: 'count(*)::int',
    insensitiveColumn: (column) => `lower(${column}::text)`,
  },
  sqlite: {
    supportsDates: false,
    supportsBooleans: false,
    countExpression: 'count(*)',
    insensitiveColumn: (column) => `lower(${column})`,
  },
};

// `bun:sql` records the engine on the instance as `options.adapter`. It is
// absent on a default Postgres connection and on hand-rolled `SQL`-shaped test
// doubles, both of which we treat as Postgres.
function detectDialect(sql: SQL): BunSqlDialect {
  const adapter = (sql.options as { adapter?: string } | undefined)?.adapter;
  if (adapter === 'sqlite') {
    return 'sqlite';
  }
  if (adapter === undefined || adapter === 'postgres') {
    return 'postgres';
  }
  throw new Error(
    `@ilbertt/better-auth-bun-sql supports only Postgres and SQLite, but the connected bun:sql adapter is "${adapter}".`,
  );
}

export function resolveDialect(sql: SQL): DialectQuirks {
  return QUIRKS[detectDialect(sql)];
}
