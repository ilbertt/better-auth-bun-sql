#!/usr/bin/env bash
# Prints the next semver (no leading "v") computed by git-cliff from the
# conventional commits since the latest tag.
set -euo pipefail

raw=$(bunx git-cliff --bumped-version 2>/dev/null)
echo "${raw#v}"
