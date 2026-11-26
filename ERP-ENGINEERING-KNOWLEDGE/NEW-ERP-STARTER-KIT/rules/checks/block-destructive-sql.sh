#!/usr/bin/env bash
# PreToolUse hook (Bash). Blocks destructive SQL / git commands unless the
# command contains the marker APPROVED-BY-OWNER:<ticket>. Exit 2 = block.
cmd=$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
if echo "$cmd" | grep -q 'APPROVED-BY-OWNER:'; then exit 0; fi
if echo "$cmd" | grep -Eiq '\b(drop[[:space:]]+(table|schema|function|view|trigger|index)|truncate|delete[[:space:]]+from|alter[[:space:]]+table[^;]*drop)\b|db[[:space:]]+(push|reset)|git[[:space:]]+push[^|;]*--force|git[[:space:]]+reset[[:space:]]+--hard'; then
  echo "Blocked: destructive command. Write the inverse SQL, get owner approval, then re-run with APPROVED-BY-OWNER:<ticket> in the command." >&2
  exit 2
fi
if echo "$cmd" | grep -Eiq '\bupdate[[:space:]]+[a-z_."]+[[:space:]]+set\b' && ! echo "$cmd" | grep -Eiq '\bwhere\b'; then
  echo "Blocked: UPDATE without WHERE." >&2
  exit 2
fi
exit 0
