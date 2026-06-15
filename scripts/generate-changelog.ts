#!/usr/bin/env bun
import { runGitCliff } from 'git-cliff';

await runGitCliff({ bump: 'auto', output: 'CHANGELOG.md' });
