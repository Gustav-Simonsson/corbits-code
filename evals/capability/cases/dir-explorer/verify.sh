#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/../verify-common.sh"
dirty=$(git status --porcelain | grep -v -E "(REPORT|PLAN)\.md$|\.corbits/" || true)
[[ -z "$dirty" ]] || { echo "FAIL: source files changed: $dirty"; exit 1; }
[[ -f REPORT.md ]] || { echo 'FAIL: no REPORT.md'; exit 1; }
grep -q 'src/cart.ts' REPORT.md && grep -q 'lineTotal' REPORT.md && grep -q 'cartTotal' REPORT.md || { echo 'FAIL: report missing path or functions'; exit 1; }
echo 'PASS: explorer'
