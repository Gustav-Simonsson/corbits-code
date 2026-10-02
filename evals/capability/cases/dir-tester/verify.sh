#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/../verify-common.sh"
dirty=$(git status --porcelain | grep -v -E "(REPORT|PLAN)\.md$|\.corbits/" || true)
[[ -z "$dirty" ]] || { echo "FAIL: source files changed: $dirty"; exit 1; }
[[ -f REPORT.md ]] || { echo 'FAIL: no REPORT.md'; exit 1; }
grep -qi 'removes all matching skus' REPORT.md || { echo 'FAIL: failing test not named'; exit 1; }
grep -qi -E 'splice|skip|mutat|index' REPORT.md || { echo 'FAIL: cause not identified'; exit 1; }
grep -qi -E 'bun test|exit' REPORT.md || { echo 'FAIL: no command evidence'; exit 1; }
echo 'PASS: tester'
