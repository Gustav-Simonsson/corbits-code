#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/../verify-common.sh"
dirty=$(git status --porcelain | grep -v -E "(REPORT|PLAN)\.md$|\.corbits/" || true)
[[ -z "$dirty" ]] || { echo "FAIL: source files changed: $dirty"; exit 1; }
[[ -f PLAN.md ]] || { echo 'FAIL: no PLAN.md'; exit 1; }
grep -q 'src/cart.ts' PLAN.md && grep -q 'tests/' PLAN.md || { echo 'FAIL: plan missing files'; exit 1; }
n=$(grep -c -E '^\s*([0-9]+[.)]|-|\*)\s' PLAN.md || true)
[[ "$n" -ge 4 ]] || { echo 'FAIL: fewer than 4 steps'; exit 1; }
echo 'PASS: counsel'
