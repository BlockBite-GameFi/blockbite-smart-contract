#!/usr/bin/env bash
set -euo pipefail

REPO="BlockBite-GameFi/blockbite-smart-contract"
HEAD="week9-documentation"
BASE="main"
TITLE="docs: Week 9 - Complete GitBook documentation for BlockBite vesting program"

echo "=== Checking if PR already exists ==="
EXISTING=$(curl -s \
  -H "Authorization: token $GH_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/${REPO}/pulls?head=BlockBite-GameFi:${HEAD}&base=${BASE}&state=open" \
  | python3 -c "import json,sys; prs=json.load(sys.stdin); print(prs[0]['number'] if prs else '')" 2>/dev/null || true)

if [ -n "$EXISTING" ]; then
  echo "PR #$EXISTING already exists — skipping creation"
  exit 0
fi

echo "=== Creating PR via REST API ==="
BODY="Week 9 documentation deliverable for BlockBite vesting program.

Files added:
- docs/PROGRAM.md: all 9 instructions with params, accounts, errors, TypeScript examples
- docs/INTEGRATION.md: 8-step guide with inline warnings and error handling
- docs/STREAM_MODEL.md: StreamAccount byte layout with offsets, lifecycle diagram
- docs/ADR.md: 6 Architecture Decision Records
- docs/ERROR_MAP.md: all 21 error codes with trigger conditions and fixes
- docs/CLIFF_VESTING.md: calculate_unlocked deep-dive, 4 vesting modes, 13 edge cases
- docs/TESTING.md: guide for all 41 tests (13 Rust unit + 28 TypeScript)
- docs/SETUP.md: prerequisites, build, test, deploy
- docs/CHANGELOG.md: week-by-week history (Week 3 to Week 9)
- .gitbook.yaml + SUMMARY.md: fix GitBook navigation

Acceptance criteria:
[x] Instruction reference: all 9 instructions documented
[x] Integration guide: step-by-step with working TypeScript snippets
[x] ADRs: 6 architecture decisions
[x] Setup guide updated from Week 3
[x] Marketing review noted in INTEGRATION.md
[x] GitBook navigation fixed"

PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({
  'title': sys.argv[1],
  'head': sys.argv[2],
  'base': sys.argv[3],
  'body': sys.argv[4]
}))
" "$TITLE" "$HEAD" "$BASE" "$BODY")

HTTP_CODE=$(curl -s -o /tmp/pr-response.json -w "%{http_code}" \
  -X POST \
  -H "Authorization: token $GH_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "https://api.github.com/repos/${REPO}/pulls")

echo "HTTP status: $HTTP_CODE"
cat /tmp/pr-response.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('html_url', d.get('message', d.get('errors', 'unknown'))))"

if [ "$HTTP_CODE" = "201" ]; then
  echo "SUCCESS: PR created"
elif [ "$HTTP_CODE" = "422" ]; then
  MSG=$(python3 -c "import json,sys; d=json.load(open('/tmp/pr-response.json')); print(d.get('errors', d.get('message','')))")
  echo "422 response: $MSG"
  echo "This usually means a PR already exists or there are no diff between branches"
else
  echo "FAILED with HTTP $HTTP_CODE"
  exit 1
fi
