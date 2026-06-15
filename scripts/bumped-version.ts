#!/usr/bin/env bun
// Prints the next semver (no leading "v") computed by git-cliff from the
// conventional commits since the latest tag.
import { $ } from 'bun';

const raw = (await $`bunx git-cliff --bumped-version`.quiet().text()).trim();
console.log(raw.replace(/^v/, ''));
