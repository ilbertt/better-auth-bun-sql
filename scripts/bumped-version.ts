#!/usr/bin/env bun
// Prints the next semver (no leading "v") computed by git-cliff from the
// conventional commits since the latest tag.
import { runGitCliff } from 'git-cliff';

const { stdout } = await runGitCliff(
  { bumpedVersion: true },
  { stdio: ['ignore', 'pipe', 'ignore'] },
);
console.log(String(stdout).trim().replace(/^v/, ''));
