import { afterAll, describe, expect, it } from 'vitest';
import { generateSchema } from '../support/create-schema.ts';
import { dialectConnection } from '../support/engines.ts';
import { readFixtureDdl } from '../support/fixtures.ts';

const sql = dialectConnection('postgres');

afterAll(async () => {
  await sql.close();
});

describe('createSchema on postgres', () => {
  it('reproduces the committed fixture for the core models', async () => {
    const { code } = await generateSchema({ config: { sql } });
    expect(code.trim()).toBe(await readFixtureDdl('postgres'));
  });

  it('qualifies tables, foreign keys and indexes with the configured schema', async () => {
    const { code } = await generateSchema({ config: { sql, pgSchema: 'app_auth' } });

    expect(code).toContain('create table "app_auth"."user" (');
    expect(code).toContain('references "app_auth"."user" ("id") on delete cascade');
    expect(code).toContain('create index "session_userId_idx" on "app_auth"."session" ("userId")');
  });

  it('prefixes table, foreign key and index names when tablesPrefix is set', async () => {
    const { code } = await generateSchema({
      config: { sql, pgSchema: 'app_auth', tablesPrefix: 'auth_' },
    });

    expect(code).toContain('create table "app_auth"."auth_user" (');
    expect(code).toContain('references "app_auth"."auth_user" ("id") on delete cascade');
    expect(code).toContain(
      'create index "auth_session_userId_idx" on "app_auth"."auth_session" ("userId")',
    );
    expect(code).toContain(
      'create unique index "auth_account_issuer_accountId_uidx" on "app_auth"."auth_account" ("issuer", "accountId")',
    );
  });

  // Where the generated DDL deliberately parts ways with better-auth's Kysely
  // output, because this adapter declares fewer native capabilities.
  describe('columns follow the capabilities the adapter declares', () => {
    it('stores json and arrays as text rather than jsonb', async () => {
      const { code } = await generateSchema({
        config: { sql },
        options: {
          user: {
            additionalFields: { metadata: { type: 'json' }, tags: { type: 'string[]' } },
          },
        },
      });

      // `supportsJSON`/`supportsArrays` are false, so better-auth hands the
      // adapter a JSON string — jsonb would read back as an already-parsed object.
      expect(code).toContain('"metadata" text not null');
      expect(code).toContain('"tags" text not null');
      expect(code).not.toContain('jsonb');
    });

    it('keeps uuid ids as text because it never sees a native uuid', async () => {
      const { code } = await generateSchema({
        config: { sql },
        options: { advanced: { database: { generateId: 'uuid' } } },
      });

      expect(code).toContain('"id" text not null primary key');
      expect(code).not.toContain('gen_random_uuid');
    });
  });
});
