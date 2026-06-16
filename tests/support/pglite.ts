import type { PGlite } from '@electric-sql/pglite';
import type { SQL } from 'bun';
import {
  type CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type QueryResult,
} from 'kysely';

// PGlite resolves a query to `{ rows, affectedRows }`; the bun:sql adapter expects
// the rows array to carry `count` (affected rows). This shim bridges the two so
// the real adapter runs unmodified against in-memory Postgres. It exposes no
// `options.adapter`, so the adapter falls back to the Postgres dialect.
export function pgliteShim(db: PGlite): SQL {
  // biome-ignore lint/complexity/useMaxParams: mirrors bun:sql's unsafe(text, params) signature
  const unsafe = async (text: string, params: unknown[]) => {
    const result = await db.query(text, params);
    const rows = result.rows as Record<string, unknown>[] & { count: number };
    rows.count = result.affectedRows ?? 0;
    return rows;
  };
  return { unsafe } as unknown as SQL;
}

// A minimal Kysely dialect over PGlite so better-auth's own migration generator
// can introspect/compile/run Postgres DDL against in-memory Postgres — used by
// tests and the fixture generator, never shipped.
export function pgliteKyselyDialect(client: PGlite): Dialect {
  const connection: DatabaseConnection = {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      const result = await client.query<R>(compiled.sql, compiled.parameters as unknown[]);
      return { rows: result.rows, numAffectedRows: BigInt(result.affectedRows ?? 0) };
    },
    streamQuery(): AsyncIterableIterator<QueryResult<never>> {
      throw new Error('streaming is not supported');
    },
  };
  const driver: Driver = {
    init: () => Promise.resolve(),
    acquireConnection: () => Promise.resolve(connection),
    beginTransaction: () => Promise.resolve(),
    commitTransaction: () => Promise.resolve(),
    rollbackTransaction: () => Promise.resolve(),
    releaseConnection: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
  };
  return {
    createDriver: () => driver,
    createAdapter: () => new PostgresAdapter(),
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createIntrospector: (db: Kysely<unknown>) => new PostgresIntrospector(db),
  };
}
