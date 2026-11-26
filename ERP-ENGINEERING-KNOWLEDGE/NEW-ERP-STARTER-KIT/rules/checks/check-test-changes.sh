#!/usr/bin/env bash
# CI (R-AI-04): if existing test files were modified, commit messages must cite an id.
base=${1:-origin/main}
mod=$(git diff --name-status "$base"...HEAD | awk '$1=="M"{print $2}' | grep -E '(\.test\.|\.spec\.|/tests?/|_test\.sql)')
[ -z "$mod" ] && exit 0
git log "$base"..HEAD --format=%B | grep -Eq '(FR|BR|NFR)-[0-9]{3}|BD-F-[0-9]{3}|#[0-9]+' && exit 0
echo "Existing tests modified without a requirement/defect id in commit messages (R-AI-04):"; echo "$mod"; exit 1
