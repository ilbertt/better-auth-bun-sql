#!/usr/bin/env bash
# Regenerates CHANGELOG.md, prepending the next (bumped) unreleased section.
set -euxo pipefail

bunx git-cliff --bump -o CHANGELOG.md
