import { Database } from 'bun:sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { afterAll, describe, expect, it } from 'vitest';
import type { BetterAuthOptions } from '../support/adapter.ts';
import { generateSchema } from '../support/create-schema.ts';
import { dialectConnection } from '../support/engines.ts';
import { readFixtureDdl } from '../support/fixtures.ts';

const sql = dialectConnection('sqlite');

afterAll(async () => {
  await sql.close();
});

// better-auth's own migrator. It needs no container on SQLite, so the canonical
// schema can be recomputed per option set instead of only for the core models the
// committed fixtures cover.
async function canonicalSqliteDdl(options: BetterAuthOptions): Promise<string> {
  const database = new Database(':memory:');
  try {
    const { compileMigrations } = await getMigrations({ ...options, database } as never);
    return (await compileMigrations()).trim();
  } finally {
    database.close();
  }
}

const OPTION_SETS: { name: string; options: BetterAuthOptions }[] = [
  { name: 'the core models', options: {} },
  {
    name: 'additional fields of every supported type',
    options: {
      user: {
        additionalFields: {
          age: { type: 'number' },
          followers: { type: 'number', bigint: true },
          metadata: { type: 'json' },
          tags: { type: 'string[]' },
          scores: { type: 'number[]' },
          role: { type: ['admin', 'member'] },
          nickname: { type: 'string', unique: true },
          bannedAt: { type: 'date', required: false },
          handle: { type: 'string', index: true },
          slug: { type: 'string', unique: true, index: true },
        },
      },
    },
  },
  {
    name: 'custom model and field names',
    options: {
      user: { modelName: 'app_user', fields: { email: 'email_address' } },
      session: { modelName: 'app_session', fields: { userId: 'user_ref' } },
      account: {
        modelName: 'app_account',
        fields: { issuer: 'issuer_name', accountId: 'external_account_id' },
      },
    },
  },
  {
    name: 'a plugin table referencing user',
    options: {
      plugins: [
        {
          id: 'passkey',
          schema: {
            passkey: {
              fields: {
                name: { type: 'string', required: false },
                counter: { type: 'number', required: true },
                userId: {
                  type: 'string',
                  required: true,
                  references: { model: 'user', field: 'id', onDelete: 'cascade' },
                  index: true,
                },
              },
            },
          },
        },
      ],
    },
  },
  {
    name: 'database-assigned numeric ids',
    options: { advanced: { database: { generateId: 'serial' } } },
  },
];

describe('createSchema on sqlite', () => {
  it.each(OPTION_SETS)('matches better-auth for $name', async ({ options }) => {
    const { code } = await generateSchema({ config: { sql }, options });
    expect(code.trim()).toBe(await canonicalSqliteDdl(options));
  });

  it('reproduces the committed fixture for the core models', async () => {
    const { code } = await generateSchema({ config: { sql } });
    expect(code.trim()).toBe(await readFixtureDdl('sqlite'));
  });

  it('drops the schema qualification, where schemas do not exist', async () => {
    const { code } = await generateSchema({
      config: { sql, pgSchema: 'app_auth', tablesPrefix: 'auth_' },
    });

    expect(code).not.toContain('app_auth');
    expect(code).toContain('create table "auth_user" (');
    expect(code).toContain('references "auth_user" ("id") on delete cascade');
  });
});
