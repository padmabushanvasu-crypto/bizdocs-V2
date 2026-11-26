#!/usr/bin/env bash
# CI (R-AI-01/03/07): PR body must contain filled required sections.
# Usage: check-pr-body.sh "<pr body text>"
body="$1"; missing=""
for s in "## Requirement IDs" "## Behaviour changes" "## Blast radius" "## Tests run" "## Unverified"; do
  sec=$(printf '%s\n' "$body" | awk -v h="$s" '$0==h{f=1;next} /^## /{f=0} f' | grep -v '^\s*$' | grep -vi '^<!--')
  [ -z "$sec" ] && missing="$missing\n$s"
done
[ -n "$missing" ] && { printf 'PR body missing or empty:%b\n' "$missing"; exit 1; }
exit 0
