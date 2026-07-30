import { afterAll, describe, expect, it } from 'vitest';
import type { BunSqlDialect } from '#dialect.ts';
import type { BetterAuthOptions } from './support/adapter.ts';
import { generateSchema } from './support/create-schema.ts';
import { dialectConnection } from './support/engines.ts';

const DIALECTS: BunSqlDialect[] = ['postgres', 'sqlite'];

describe.each(DIALECTS)('createSchema on %s', (dialect) => {
  const sql = dialectConnection(dialect);

  afterAll(async () => {
    await sql.close();
  });

  it('defaults to ./auth-schema.sql and honours an explicit output file', async () => {
    const { path } = await generateSchema({ config: { sql } });
    expect(path).toBe('./auth-schema.sql');

    const explicit = await generateSchema({ config: { sql }, file: './db/auth.sql' });
    expect(explicit.path).toBe('./db/auth.sql');
  });

  it('pluralises table, foreign key and index names when usePlural is set', async () => {
    const { code } = await generateSchema({ config: { sql, usePlural: true } });

    expect(code).toContain('create table "users" (');
    expect(code).toContain('references "users" ("id") on delete cascade');
    expect(code).toContain('create index "sessions_userId_idx" on "sessions" ("userId")');
  });

  it('covers a unique indexed field with the column constraint alone', async () => {
    const { code } = await generateSchema({
      config: { sql },
      options: {
        user: { additionalFields: { slug: { type: 'string', unique: true, index: true } } },
      },
    });

    expect(code).toContain('"slug" text not null unique');
    expect(code).not.toContain('create index "user_slug_idx"');
    expect(code).not.toContain('create unique index "user_slug_uidx"');
  });

  it('reports the field it cannot map when a type is unsupported', async () => {
    await expect(
      generateSchema({
        config: { sql },
        // better-auth's own types reject `blob`, which is the point: what is
        // under test is the error the adapter raises when one reaches it anyway.
        options: {
          user: { additionalFields: { pointer: { type: 'blob' } } },
        } as unknown as BetterAuthOptions,
      }),
    ).rejects.toThrow(/field 'pointer' of type 'blob'/);
  });
});
