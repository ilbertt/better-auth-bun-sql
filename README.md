# @ilbertt/better-auth-bun-sql

A [better-auth](https://better-auth.com) database adapter for Bun's built-in SQL module ([`bun:sql`](https://bun.com/docs/runtime/sql)).

## Installation

```sh
bun add @ilbertt/better-auth-bun-sql
```

> Requires [Bun](https://bun.com) — this adapter relies on the `bun:sql` runtime module and does not work on Node.js.
>
> Bun 1.4 or later is recommended. Earlier `bun:sql` versions could hand one Postgres query's rows to another when a parameter-less query and a parameterized one shared a connection ([oven-sh/bun#32772](https://github.com/oven-sh/bun/issues/32772)) — a mix this adapter emits routinely. The adapter itself runs on 1.3.

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

| Option         | Type                      | Default | Description                                                                                                                                                                                                              |
| -------------- | ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sql`          | `SQL`                     | -       | **Required.** A `bun:sql` instance connected to a Postgres or SQLite database.                                                                                                                                            |
| `pgSchema`     | `string`                  | -       | **Postgres only.** Schema (namespace) the tables live in. When omitted, table names are unqualified and resolved against the connection's `search_path`. Ignored on SQLite, which has no schemas — use `tablesPrefix` there. |
| `tablesPrefix` | `string`                  | -       | Prepended to every table name (`user` → `auth_user`), including foreign-key targets and generated index names. Works on both engines.                                                                                     |
| `usePlural`    | `boolean`                 | `false` | Pluralize table names (`user` → `users`).                                                                                                                                                                                |
| `debugLogs`    | `DBAdapterDebugLogOption` | `false` | better-auth adapter debug logging.                                                                                                                                                                                       |

better-auth has no table-prefix option of its own — tables can only be renamed one model at a time via `modelName` — so `tablesPrefix` is applied by this adapter when the SQL is rendered, leaving better-auth's own model names untouched.

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
