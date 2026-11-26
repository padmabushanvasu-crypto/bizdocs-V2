#!/usr/bin/env bash
# Stop hook. If code changed in this working tree but docs/PROJECT-STATE.md
# and docs/SESSION-HANDOVER.md did not, ask Claude to update them first.
changed=$(git status --porcelain | awk '{print $2}')
[ -z "$changed" ] && exit 0
if echo "$changed" | grep -Eq '^(src|supabase|db|app)/' && ! echo "$changed" | grep -q 'docs/SESSION-HANDOVER.md'; then
  echo "Update docs/PROJECT-STATE.md and docs/SESSION-HANDOVER.md (what changed, evidence, unverified items, next step) before finishing." >&2
  exit 2
fi
exit 0
