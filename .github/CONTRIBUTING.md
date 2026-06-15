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

## Releasing

Versioning and the changelog are derived from the Conventional Commits history by [git-cliff](https://git-cliff.org) (`cliff.toml`).

1. Run the **prepare-release** workflow from the Actions tab. It bumps `package.json`, regenerates `CHANGELOG.md`, and opens a release PR.
2. Merge the release PR.
3. Tag the merge commit and push — this triggers **publish** (npm + GitHub Release):

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

Maintainer setup (one-time): configure an npm Trusted Publisher (OIDC) for `@ilbertt/better-auth-bun-sql` so `publish` can release without a token.

> The release PR is opened by `github-actions[bot]` via the built-in `GITHUB_TOKEN`, so its checks are gated — click **Approve and run** on the PR to let CI run before merging.
