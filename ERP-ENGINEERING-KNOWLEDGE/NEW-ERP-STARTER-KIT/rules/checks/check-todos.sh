#!/usr/bin/env bash
# CI: new TODO/FIXME/stub lines must carry an id like [#123] or Q-012 (R-AI-13).
base=${1:-origin/main}
bad=$(git diff "$base"...HEAD -U0 | grep -E '^\+' | grep -Ei 'TODO|FIXME|coming soon|not implemented' | grep -Ev '\[#[0-9]+\]|Q-[0-9]{3}|BD-F-[0-9]{3}')
if [ -n "$bad" ]; then echo "Untracked placeholder (R-AI-13):"; echo "$bad"; exit 1; fi
