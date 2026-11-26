#!/usr/bin/env bash
# CI: fail on silent clamps in app code and SQL migrations (R-DB-04).
# Whitelist a line with the comment  allow-clamp: <reason>
hits=$(grep -rnE 'Math\.max\(\s*0\s*,|GREATEST\(\s*0\s*,' "${@:-src supabase db}" 2>/dev/null | grep -v 'allow-clamp:')
if [ -n "$hits" ]; then echo "Silent clamp found (R-DB-04):"; echo "$hits"; exit 1; fi
