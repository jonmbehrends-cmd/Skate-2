#!/usr/bin/env bash
set -uo pipefail
mkdir -p evidence/tests
: > evidence/tests/stdout.txt
: > evidence/tests/stderr.txt
: > evidence/tests/results.tsv
git rev-parse HEAD > evidence/tested-commit.txt
overall=0
run_check() {
  local id="$1"; shift
  local code=0
  printf '\n=== %s ===\n' "$id" >> evidence/tests/stdout.txt
  printf '\n=== %s ===\n' "$id" >> evidence/tests/stderr.txt
  "$@" >> evidence/tests/stdout.txt 2>> evidence/tests/stderr.txt || code=$?
  printf '%s\t%s\n' "$id" "$code" >> evidence/tests/results.tsv
  if [ "$code" -ne 0 ]; then overall=1; fi
}
for f in controller landing terrain ramp_geometry obstacles grind motion wheels skater bowl; do
  run_check "syntax:$f" node --check "$f.js"
done
for t in controller terrain obstacles grind motion wheels landing check_inline push ramp_mesh halfpipe input bowl; do
  run_check "test:$t" node "tests/$t.cjs"
done
printf '{"logicExitCode":%s,"browser":"not_run","reason":"Dedicated browser CI runs separately"}\n' "$overall" > evidence/tests/summary.json
exit "$overall"
