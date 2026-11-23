#!/usr/bin/env bash
# Runs the vitest suite as several smaller, sequential invocations instead
# of one process spanning all ~470 test files.
#
# Why: under vitest.stable.config.ts's pool:'forks'/isolate:true, each test
# file gets a fresh module graph, but the ~40-60MB of jsdom/React/module
# overhead that comes with it is never reclaimed within the same shared
# worker process. Confirmed via `vitest --logHeapUsage`: no single file is
# an outlier, but the accumulation across all files is roughly additive and
# exceeds an 8GB heap ceiling before the run completes. Splitting into
# separate process invocations resets that accumulation between shards,
# each comfortably bounded (largest shard here is 141 files, which alone
# used well under 1GB across a full run).
#
# Runs every shard regardless of earlier failures (so a single shard's test
# failures/pre-existing issues don't hide OOM or failures in later shards),
# then exits non-zero if any shard failed, crashed, or timed out.
#
# Each shard is bounded by a hard wall-clock timeout. This codebase has
# turned out to have more than one individual test file with a genuine
# runaway bug (an OOM crash from unbounded real-timer recursion, found and
# partially fixed/excluded — see vitest.stable.config.ts's exclude list —
# plus at least one further hang discovered after that fix, not yet
# isolated). Chasing each one individually doesn't scale; a timeout bounds
# the damage from any single bad test file to this shard's budget instead
# of hanging the whole run indefinitely. A shard that times out needs its
# own investigation (rerun it alone with --logHeapUsage to bisect), but
# won't block every other shard from reporting.
set -uo pipefail

status=0
SHARD_TIMEOUT=300 # seconds

run_shard() {
  local name="$1"
  shift
  echo ""
  echo "=== test shard: ${name} ==="
  # A ceiling, not what is used: measured 2026-10-07, a shard peaks at 0.5-0.7 GB across its processes. Each
  # process inherits it, so 8 GB each let two of them ask for twice this 8 GB machine before anything failed.
  NODE_OPTIONS='--max-old-space-size=3072' timeout "${SHARD_TIMEOUT}s" npx vitest run --config vitest.stable.config.ts "$@"
  local shard_status=$?
  if [ "$shard_status" -eq 124 ]; then
    echo "=== test shard TIMED OUT: ${name} (exceeded ${SHARD_TIMEOUT}s) ==="
    status=1
  elif [ "$shard_status" -ne 0 ]; then
    echo "=== test shard FAILED: ${name} (exit ${shard_status}) ==="
    status=1
  fi
}

run_shard "services"       src/services
run_shard "components"     src/components src/hooks src/context
# applications/geopolitical/core/solar-system/globe-engine pull in the same
# heavy THREE.js/3D-rendering code as the multi-megabyte production bundle
# chunks (AnalysisWorkbench, CyberCommandApplication, vendor-three) --
# confirmed by OOM-crashing when combined at 125 files, well below what the
# lighter shards above handle cleanly at 140+. Kept in a smaller, separate
# shard. (The real applications+geopolitical+core crash was traced to one
# specific file, src/core/intel/tests/performanceOptimizationHooks.test.ts,
# now excluded in vitest.stable.config.ts — see its comment there. With
# that file out, this combined grouping runs clean; kept split anyway as a
# margin of safety for this heavier code.)
run_shard "applications"   src/applications src/geopolitical src/core
run_shard "3d-effects"     src/solar-system src/globe-engine
# The shard list is a set of explicit paths, so a directory absent from it is
# silently never run — including by `npm test`, which is the command people
# actually use. Eight paths were in that gap, among them scripts/__tests__,
# which holds the 14 self-tests of the guards. vitest.stable.config.ts added
# `scripts/**/*.test.ts` to its include specifically so those would run, and
# they did under `npm run verify` (which passes no paths) while `npm test` kept
# skipping them. The guards are the only gate this repository has.
#
# Measured before adding: 24 files, 147 tests, all passing. Nothing here was
# broken — it was unobserved.
run_shard "misc"           src/utils src/pages src/lib \
                            src/types src/testing src/communication src/security \
                            src/features src/data src/models test/
run_shard "guards+edges"   scripts src/api src/interfaces src/layouts \
                            src/routes src/shared src/styles

exit "$status"
