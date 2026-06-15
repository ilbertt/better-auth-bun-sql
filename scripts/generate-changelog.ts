#!/usr/bin/env bun
// Regenerates CHANGELOG.md, including the next (bumped) unreleased section.
import { $ } from 'bun';

await $`bunx git-cliff --bump -o CHANGELOG.md`;
