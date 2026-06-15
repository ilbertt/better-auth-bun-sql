# Contributing to better-auth-bun-sql

## Development setup

```bash
git clone https://github.com/ilbertt/better-auth-bun-sql
cd better-auth-bun-sql
bun install
```

## Validation

Before opening a PR, make sure the following pass:

```bash
bun fix:codestyle  # auto-fix formatting/lint issues
bun check:all      # verify types and codestyle
bun test           # run the test suite
bun run build      # verify the build succeeds
```

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages to the main branch. Make sure your PR title is in the correct format.
