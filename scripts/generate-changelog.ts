#!/usr/bin/env bun
// Regenerates CHANGELOG.md, including the next (bumped) unreleased section.
import { runGitCliff } from 'git-cliff';

await runGitCliff({ bump: 'auto', output: 'CHANGELOG.md' });
