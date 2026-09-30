#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/../verify-common.sh"
dirty=$(git status --porcelain | grep -v -E "(REPORT|PLAN)\.md$|\.corbits/" || true)
[[ -z "$dirty" ]] || { echo "FAIL: source files changed: $dirty"; exit 1; }
[[ -f REPORT.md ]] || { echo 'FAIL: no REPORT.md'; exit 1; }
grep -qi -E 'twice|double|both.*(lineTotal|cartTotal)|applied again|compound' REPORT.md || { echo 'FAIL: missed double discount'; exit 1; }
grep -qi -E 'splice|skip|mutat|index' REPORT.md || { echo 'FAIL: missed removeSku splice bug'; exit 1; }
echo 'PASS: critic found both'
