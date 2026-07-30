import { SQL } from 'bun';
import type { BunSqlDialect } from '#dialect.ts';
import {
  createDatabase,
  databaseUrl,
  dropDatabase,
  POSTGRES_TARGETS,
  type PostgresTarget,
} from './postgres.ts';

const SQLITE_MEMORY = ':memory:';

// Never dialled: `createSchema` renders DDL from the resolved better-auth schema
// alone, so the connection only has to tell the adapter which dialect to emit.
const UNCONNECTED_POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';

/** The SQLite one does open an in-memory database, so close it when done. */
export function dialectConnection(dialect: BunSqlDialect): SQL {
  return new SQL(dialect === 'sqlite' ? SQLITE_MEMORY : UNCONNECTED_POSTGRES_URL);
}

export type Engine = {
  label: string;
  open: () => Promise<SQL>;
  /**
   * An empty database on a *new* connection: bun:sql caches prepared statements
   * per connection, and a plan cached against the previous schema trips "cached
   * plan must not change result type" once the tables are rebuilt.
   */
  reopen: () => Promise<SQL>;
  /** Releases what `open` allocated; the connection itself is closed by the caller. */
  finish: () => Promise<void>;
};

export type PostgresEngine = Engine & { url: string };

export function postgresEngine({
  target,
  database,
}: {
  target: PostgresTarget;
  database: string;
}): PostgresEngine {
  const url = databaseUrl({ port: target.port, name: database });
  return {
    label: `postgres ${target.version}`,
    url,
    open: () => createDatabase({ port: target.port, name: database }),
    reopen: async () => {
      const sql = new SQL(url);
      await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      return sql;
    },
    finish: () => dropDatabase({ port: target.port, name: database }),
  };
}

export function postgresEngines({ database }: { database: string }): PostgresEngine[] {
  return POSTGRES_TARGETS.map((target) => postgresEngine({ target, database }));
}

export function latestPostgresEngine({ database }: { database: string }): PostgresEngine {
  // POSTGRES_TARGETS is ordered oldest to newest.
  const target = POSTGRES_TARGETS.at(-1);
  if (!target) {
    throw new Error('no Postgres target is configured');
  }
  return postgresEngine({ target, database });
}

/** A new in-memory database is already empty, which is why `finish` is a no-op. */
export function sqliteEngine(): Engine {
  return {
    label: 'sqlite',
    open: () => Promise.resolve(new SQL(SQLITE_MEMORY)),
    reopen: () => Promise.resolve(new SQL(SQLITE_MEMORY)),
    finish: () => Promise.resolve(),
  };
}
