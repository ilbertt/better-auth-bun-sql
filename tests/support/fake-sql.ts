import type { SQL } from 'bun';
import type { BunSqlDialect } from '#dialect.ts';

export type Call = { text: string; params: unknown[] };

/**
 * Nothing is executed, so the exact SQL text the adapter emits can be asserted.
 * `count` stands in for the affected-row total bun:sql exposes on a result.
 *
 * `dialect` is reported through `options.adapter`, the way a real bun:sql
 * instance reports its engine; leaving it out drops `options` entirely — the
 * shape a default Postgres connection has.
 */
export function fakeSql({
  rows = [],
  count,
  dialect,
}: {
  rows?: Record<string, unknown>[];
  count?: number;
  dialect?: BunSqlDialect;
} = {}): { sql: SQL; calls: Call[] } {
  const calls: Call[] = [];
  // biome-ignore lint/complexity/useMaxParams: mirrors bun:sql's unsafe(text, params) signature
  const unsafe = (text: string, params: unknown[]) => {
    calls.push({ text, params });
    const result = [...rows] as Record<string, unknown>[] & { count: number };
    result.count = count ?? rows.length;
    return Promise.resolve(result);
  };
  const options = dialect ? { adapter: dialect } : undefined;
  return { sql: { unsafe, options } as unknown as SQL, calls };
}

export function lastCall(calls: Call[]): Call {
  const call = calls.at(-1);
  if (!call) {
    throw new Error('the adapter executed no query');
  }
  return call;
}
