# @ilbertt/better-auth-bun-sql

A [better-auth](https://better-auth.com) database adapter for Bun's built-in SQL module ([`bun:sql`](https://bun.com/docs/runtime/sql)).

## Installation

```sh
bun add @ilbertt/better-auth-bun-sql
```

> Requires [Bun](https://bun.com) — this adapter relies on the `bun:sql` runtime module and does not work on Node.js.

## Usage

Pass a `bun:sql` instance — connected to Postgres or SQLite — to `bunSqlAdapter`:

```ts
import { betterAuth } from 'better-auth';
import { SQL } from 'bun';
import { bunSqlAdapter } from '@ilbertt/better-auth-bun-sql';

const sql = new SQL(process.env.DATABASE_URL); // e.g. postgres://… or sqlite://…

export const auth = betterAuth({
  database: bunSqlAdapter({ sql }),
});
```

### Options

| Option      | Type                      | Default           | Description                                                                                                                                     |
| ----------- | ------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `sql`       | `SQL`                     | -       | **Required.** A `bun:sql` instance connected to a Postgres or SQLite database.                                                                 |
| `schema`    | `string`                  | -       | Database schema (namespace) the tables live in. When omitted, table names are unqualified and resolved against the connection's `search_path`. SQLite has no schemas, so there it only works against an `ATTACH`ed database of that name. |
| `usePlural` | `boolean`                 | `false` | Pluralize table names (`user` → `users`).                                                                                                     |
| `debugLogs` | `DBAdapterDebugLogOption` | `false` | better-auth adapter debug logging.                                                                                                            |

## Generating the schema

The adapter implements better-auth's [`createSchema`](https://better-auth.com/docs/guides/create-a-db-adapter#createschema-optional), so [`@better-auth/cli`](https://www.better-auth.com/docs/concepts/cli) can generate the SQL for the tables better-auth expects — into `./auth-schema.sql`, or wherever `--output` points:

```sh
bun run --bun better-auth generate --config src/auth.ts
```

Run the CLI with `--bun`. Its executable has a Node shebang, so without the flag it won't run on the Bun runtime this package needs.

## Supported databases

`bun:sql` speaks Postgres, SQLite, and MySQL/MariaDB, but this adapter supports **Postgres and SQLite only**. MySQL/MariaDB lack the `RETURNING` clause the adapter relies on for `create`/`update`, so they are intentionally unsupported (the adapter throws on a MySQL/MariaDB connection). The dialect is detected automatically from the `bun:sql` instance.

## Contributing

See [CONTRIBUTING.md](./.github/CONTRIBUTING.md).
