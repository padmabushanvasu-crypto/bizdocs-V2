#!/usr/bin/env bash
# PreToolUse hook (Edit|Write). Applied migrations are immutable: block edits
# to migration files already committed on the main branch.
f=$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))')
case "$f" in
  */migrations/*.sql)
    rel=$(git ls-files --full-name -- "$f" 2>/dev/null)
    if [ -n "$rel" ] && git cat-file -e "origin/main:$rel" 2>/dev/null; then
      echo "Blocked: $rel is an applied migration. Add a new migration instead." >&2
      exit 2
    fi;;
esac
exit 0
