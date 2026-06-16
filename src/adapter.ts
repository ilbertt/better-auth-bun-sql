import { createAdapterFactory, type DBAdapterDebugLogOption } from 'better-auth/adapters';
import type { SQL } from 'bun';
import { resolveDialect } from './dialect';
import { type Param, QueryBuilder, qualified, quoteId, selectColumns } from './sql-builder';

export interface BunSqlAdapterConfig {
  /** A `bun:sql` instance connected to a Postgres or SQLite database. */
  sql: SQL;
  /**
   * Database schema (namespace) the better-auth tables live in. When omitted,
   * table names are emitted unqualified and resolved against the connection's
   * `search_path` — matching better-auth's first-party adapters.
   */
  schema?: string;
  /** Pluralize table names (`user` → `users`). Defaults to better-auth's `false`. */
  usePlural?: boolean;
  debugLogs?: DBAdapterDebugLogOption;
}

// `bun:sql` resolves a query to a rows array that also carries `count` (the
// number of rows the statement affected) — the source of truth for the
// affected-row totals `updateMany`/`deleteMany` must return.
type SqlResult<T> = T[] & { count: number };

export function bunSqlAdapter(config: BunSqlAdapterConfig) {
  const { sql, schema, usePlural = false, debugLogs = false } = config;
  const quirks = resolveDialect(sql);

  const run = <T>({ text, params }: { text: string; params: Param[] }): Promise<SqlResult<T>> =>
    sql.unsafe(text, params) as unknown as Promise<SqlResult<T>>;

  return createAdapterFactory({
    config: {
      adapterId: 'bun-sql',
      adapterName: 'Bun SQL Adapter',
      supportsJSON: false,
      supportsArrays: false,
      supportsNumericIds: true,
      supportsDates: quirks.supportsDates,
      supportsBooleans: quirks.supportsBooleans,
      usePlural,
      debugLogs,
    },
    // `data`/`update` keys arrive already mapped to column names by the factory,
    // but `where`/`select`/`sortBy` carry model field names — so those are mapped
    // to columns here via `getFieldName`.
    adapter: ({ getFieldName }) => ({
      create: async ({ model, data }) => {
        const entries = Object.entries(data);
        const builder = new QueryBuilder({
          quirks,
          getColumn: (field) => getFieldName({ model, field }),
        });
        const table = qualified({ schema, model });
        const placeholders = entries.map(([, value]) => builder.placeholder(value as Param));
        const text =
          entries.length === 0
            ? `INSERT INTO ${table} DEFAULT VALUES RETURNING *`
            : `INSERT INTO ${table} (${entries.map(([column]) => quoteId(column)).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        const [row] = await run<Record<string, unknown>>({ text, params: builder.values() });
        return row as never;
      },

      findOne: async ({ model, where, select }) => {
        const getColumn = (field: string) => getFieldName({ model, field });
        const builder = new QueryBuilder({ quirks, getColumn });
        const text = `SELECT ${selectColumns({ select, getColumn })} FROM ${qualified({ schema, model })}${builder.whereClause(where)} LIMIT 1`;
        const [row] = await run<Record<string, unknown>>({ text, params: builder.values() });
        return (row ?? null) as never;
      },

      findMany: async ({ model, where, limit, sortBy, offset, select }) => {
        const getColumn = (field: string) => getFieldName({ model, field });
        const builder = new QueryBuilder({ quirks, getColumn });
        let text = `SELECT ${selectColumns({ select, getColumn })} FROM ${qualified({ schema, model })}${builder.whereClause(where)}`;
        if (sortBy) {
          text += ` ORDER BY ${quoteId(getColumn(sortBy.field))} ${sortBy.direction === 'desc' ? 'DESC' : 'ASC'}`;
        }
        if (typeof limit === 'number') {
          text += ` LIMIT ${builder.placeholder(limit)}`;
        }
        if (typeof offset === 'number') {
          text += ` OFFSET ${builder.placeholder(offset)}`;
        }
        return (await run<Record<string, unknown>>({ text, params: builder.values() })) as never;
      },

      count: async ({ model, where }) => {
        const builder = new QueryBuilder({
          quirks,
          getColumn: (field) => getFieldName({ model, field }),
        });
        const text = `SELECT ${quirks.countExpression} AS count FROM ${qualified({ schema, model })}${builder.whereClause(where)}`;
        const [row] = await run<{ count: number }>({ text, params: builder.values() });
        return row?.count ?? 0;
      },

      update: async ({ model, where, update }) => {
        const builder = new QueryBuilder({
          quirks,
          getColumn: (field) => getFieldName({ model, field }),
        });
        const set = builder.assignments(update as Record<string, unknown>);
        if (set.length === 0) {
          return null as never;
        }
        const text = `UPDATE ${qualified({ schema, model })} SET ${set.join(', ')}${builder.whereClause(where)} RETURNING *`;
        const [row] = await run<Record<string, unknown>>({ text, params: builder.values() });
        return (row ?? null) as never;
      },

      updateMany: async ({ model, where, update }) => {
        const builder = new QueryBuilder({
          quirks,
          getColumn: (field) => getFieldName({ model, field }),
        });
        const set = builder.assignments(update);
        if (set.length === 0) {
          return 0;
        }
        const text = `UPDATE ${qualified({ schema, model })} SET ${set.join(', ')}${builder.whereClause(where)}`;
        const result = await run<unknown>({ text, params: builder.values() });
        return result.count;
      },

      delete: async ({ model, where }) => {
        const builder = new QueryBuilder({
          quirks,
          getColumn: (field) => getFieldName({ model, field }),
        });
        await run({
          text: `DELETE FROM ${qualified({ schema, model })}${builder.whereClause(where)}`,
          params: builder.values(),
        });
      },

      deleteMany: async ({ model, where }) => {
        const builder = new QueryBuilder({
          quirks,
          getColumn: (field) => getFieldName({ model, field }),
        });
        const result = await run<unknown>({
          text: `DELETE FROM ${qualified({ schema, model })}${builder.whereClause(where)}`,
          params: builder.values(),
        });
        return result.count;
      },
    }),
  });
}
