#!/usr/bin/env bash
set -uo pipefail
mkdir -p evidence/tests
printf '%s\n' "$(git rev-parse HEAD)" > evidence/tested-commit.txt
status=0
files=(controller landing terrain ramp_geometry obstacles grind motion wheels skater bowl)
for f in "${files[@]}"; do
  echo "node --check $f.js"
  node --check "$f.js" >> evidence/tests/stdout.txt 2>> evidence/tests/stderr.txt || status=1
done
tests=(controller terrain obstacles grind motion wheels landing check_inline push ramp_mesh halfpipe input bowl)
for t in "${tests[@]}"; do
  echo "node tests/$t.cjs"
  node "tests/$t.cjs" >> evidence/tests/stdout.txt 2>> evidence/tests/stderr.txt || status=1
done
printf '{"logicExitCode":%s,"browser":"not-run","reason":"Existing dedicated browser CI runs separately"}\n' "$status" > evidence/tests/summary.json
exit "$status"
