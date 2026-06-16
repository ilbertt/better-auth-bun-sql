## Project

`@ilbertt/better-auth-bun-sql` — a [better-auth](https://better-auth.com) database adapter for Bun's built-in SQL module (`bun:sql`). Single published package (not a monorepo). The root `package.json` is the one published to npm; `src/` holds the source, `tests/` holds the tests.

## Stack

- **Runtime:** Bun (the adapter relies on `bun:sql` and is Bun-only)
- **Linter/Formatter:** Biome (auto-formats on save)
- **Tests:** vitest — run with `bun run test` (imports from `vitest`, not `bun:test`)
- **Commits:** Conventional Commits (commitlint)

The Bun version is pinned in three places that must be bumped together: `.bun-version` (consumed by CI's `setup-bun` — keep it version-only, no comments), `packageManager` in `package.json`, and `engines.bun`.

## Code style

- No comments that restate what types and naming already say — only comment the non-obvious
- Imports use `#*` subpath mapping (e.g. `import { foo } from '#services/foo'` → `src/services/foo`)
- Single source of truth — never duplicate keys, enum values, or type info that belongs to a class/module; derive from the source instead
- Biome enforces `useMaxParams: 1` — wrap multiple params in an object
- Only re-export from index files — Biome enforces that (`noBarrelFile`)

## Validation

After finishing an implementation, always run:

1. `bun fix:codestyle` — auto-fix formatting/lint issues
2. `bun check:all` — verify types and codestyle pass
3. `bun run test` — run the test suite (vitest, via `bun --bun vitest run`)
4. `bun run build` — verify the build succeeds

Check `package.json` scripts for other available commands.

## Test fixtures

`tests/fixtures/*.sql` are the canonical better-auth schema, generated from the installed better-auth by `bun run generate:fixtures` — never hand-edited. Regenerate (and commit) after bumping better-auth; CI fails if they drift.

## Run scripts

When running a script, always check the `package.json` scripts for available commands first.

## Publishing

This is a **Bun-only** package. It ships the raw TypeScript source for the runtime and generated declarations for type-checking — there is no compiled JS. `exports`:

```jsonc
"exports": {
  ".": {
    "types": "./dist/index.d.ts", // tsc / editors → generated declarations
    "bun": "./src/index.ts"        // Bun runtime → runs the raw TS source
  }
}
```

- **Runtime:** Bun matches the `"bun"` condition and imports `src/index.ts` directly (Bun transpiles TS natively). That's why `src/**/*.ts` is in `files` and the `#*` map resolves at the consumer (`./src/*` is shipped). No `default`/`import` fallback — non-Bun runtimes are intentionally unsupported.
- **Types:** the type-check path is always vanilla `tsc` (the consumer's editor/build), never Bun. So types come from `dist/`, which `bun run build` generates by running `tsc --project tsconfig.build.json` (declaration-only emit). Pointing `types` at the raw `src/index.ts` does **not** work for this package: `tsc` would parse our internal `bun:sql`/`Bun` references and fail (TS2307) unless every consumer configures Bun types — and `skipLibCheck` only rescues `.d.ts`, not `.ts`. The generated `.d.ts` exposes only the public surface and is `skipLibCheck`-eligible. The top-level `types` field mirrors `./dist/index.d.ts` so npm shows the TypeScript badge.

`bun run build` (`build.ts`, via Bun's `$` shell) emits only `.d.ts` files into `dist/`, mirroring the `src/` layout. Keep imports that appear in the public type surface relative (`./foo`) so the emitted declarations resolve against sibling `.d.ts` files in `dist/`; `#*` is for runtime/internal use. `better-auth` is a peer dependency. Releases are git-cliff–driven; see `.github/CONTRIBUTING.md`.

## Pull requests

Keep PR descriptions minimal — the diff is self-explanatory, so don't enumerate every change. State the intent in a line or two.

## Keeping this file up to date

When a change affects code style, tooling, conventions, or project taste (new lint rules, formatter config, naming patterns, dependency choices, etc.), propose updating this file to reflect it.
