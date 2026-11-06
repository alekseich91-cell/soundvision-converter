#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --test tests/*.test.mjs
if [[ -n "${DWG_FIXTURE:-}" ]]; then
  node scripts/check-dwg.mjs "$DWG_FIXTURE"
fi
