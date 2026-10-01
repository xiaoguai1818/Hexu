#!/usr/bin/env bash
# Test real compiled core/container/SQLite behavior. The HTTP host is a CI-only fixture.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
: "${HEXU_SOURCE_SHA:?exact source SHA is required}"
: "${HEXU_CI_TAG:?unique image tag is required}"
case "$HEXU_CI_TAG" in *[!a-zA-Z0-9_.-]*|'') echo 'Invalid CI tag' >&2; exit 1;; esac
project="hexu-ci-${HEXU_CI_TAG,,}"
HEXU_CI_UID=$(id -u)
HEXU_CI_GID=$(id -g)
export HEXU_CI_UID HEXU_CI_GID
report="$PWD/ci-results/deployment"
private="$PWD/ci-results/private"
mkdir -p "$report" "$private"
compose=(docker compose -p "$project" -f compose.ci.yaml)
cleanup() {
  local status=$?
  trap - EXIT
  "${compose[@]}" logs --no-color > "$report/containers.log" 2>&1 || :
  "${compose[@]}" ps --all --format json > "$report/containers.json" 2>&1 || :
  if ! "${compose[@]}" down --volumes --remove-orphans >> "$report/cleanup.log" 2>&1; then
    echo 'CI deployment cleanup failed' >&2
    if [ "$status" -eq 0 ]; then status=1; fi
  fi
  rm -f "$private/credentials.json"
  printf '%s\n' "$status" > "$report/exit-code.txt"
  exit "$status"
}
trap cleanup EXIT
# Random disposable identities, only for the fixture; never put these in artifacts.
node --input-type=module -e '
import {randomBytes} from "node:crypto";import {writeFileSync} from "node:fs";
const roles=["owner","member","reviewer","worker","outsider","platform-admin"];
writeFileSync("ci-results/private/credentials.json",JSON.stringify(Object.fromEntries(roles.map(r=>[r,randomBytes(32).toString("hex")]))),{mode:0o644});'

"${compose[@]}" build --pull app client 2>&1 | tee "$report/build.log"
docker build --target runtime -t "hexu-ci-runtime:$HEXU_CI_TAG" . >> "$report/build.log" 2>&1
runtime_id=$(docker image inspect --format '{{.Id}}' "hexu-ci-runtime:$HEXU_CI_TAG")
fixture_id=$(docker image inspect --format '{{.Id}}' "hexu-ci-fixture:$HEXU_CI_TAG")
printf '%s\n' "$runtime_id" > "$report/runtime-image-id.txt"
printf '%s\n' "$fixture_id" > "$report/fixture-image-id.txt"
# Exercise the transferable image rather than rebuilding between export and use.
docker save "hexu-ci-runtime:$HEXU_CI_TAG" -o "$private/runtime.tar"
sha256sum "$private/runtime.tar" > "$report/runtime-archive.sha256"
docker load -i "$private/runtime.tar" > "$report/image-load.log"
test "$runtime_id" = "$(docker image inspect --format '{{.Id}}' "hexu-ci-runtime:$HEXU_CI_TAG")"
rm -f "$private/runtime.tar"

# These template expressions belong to JavaScript, not the shell.
# shellcheck disable=SC2016
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true "hexu-ci-runtime:$HEXU_CI_TAG" node --input-type=module -e '
import assert from "node:assert/strict";import {existsSync,readFileSync} from "node:fs";
assert.notEqual(process.getuid(),0);const core=await import("./dist/index.js");assert.equal(typeof core.TaskService,"function");
for(const path of ["src","test","node_modules",".git",".env","ci/fixture-server.mjs"])assert.equal(existsSync(path),false,`Unexpected runtime content: ${path}`);
for(const stage of ["requirements","development"])assert.ok(readFileSync(`skills/${stage}/SKILL.md`,"utf8").length>100);
console.log("Runtime artifact: compiled code and skills load as non-root without dev/source/test files");' | tee "$report/runtime-package.log"

"${compose[@]}" up -d --wait --wait-timeout 90 app app-peer 2>&1 | tee "$report/startup.log"
"${compose[@]}" run --rm -T client 2>&1 | tee "$report/functional.log"
"${compose[@]}" run --rm -T client node test/deployment/lifecycle.mjs prepare | tee "$report/lifecycle.log"

# Abrupt process loss: data must survive; state recovery must not invent a rerun.
"${compose[@]}" kill -s SIGKILL app app-peer >> "$report/lifecycle.log" 2>&1
"${compose[@]}" up -d --wait --wait-timeout 90 app app-peer >> "$report/lifecycle.log" 2>&1
"${compose[@]}" run --rm -T client node test/deployment/lifecycle.mjs verify >> "$report/lifecycle.log" 2>&1
# Recreate container from the same artifact while preserving the volume.
"${compose[@]}" up -d --force-recreate --wait --wait-timeout 90 app app-peer >> "$report/lifecycle.log" 2>&1
"${compose[@]}" run --rm -T client node test/deployment/lifecycle.mjs verify >> "$report/lifecycle.log" 2>&1

# Consistent offline backup, destroy the CI volume, restore into a brand-new volume.
"${compose[@]}" stop app app-peer >> "$report/lifecycle.log" 2>&1
container=$("${compose[@]}" ps --all -q app)
docker cp "$container:/data/tasks.sqlite" "$report/backup.sqlite"
"${compose[@]}" logs --no-color > "$report/before-restore.log" 2>&1
"${compose[@]}" down --volumes --remove-orphans >> "$report/lifecycle.log" 2>&1
"${compose[@]}" create app app-peer >> "$report/lifecycle.log" 2>&1
container=$("${compose[@]}" ps --all -q app)
docker cp "$report/backup.sqlite" "$container:/data/tasks.sqlite"
# docker cp writes as root; repair only the disposable CI volume, before startup.
docker run --rm --user 0 --network none --cap-drop ALL --cap-add CHOWN --security-opt no-new-privileges:true --volumes-from "$container" "hexu-ci-runtime:$HEXU_CI_TAG" chown 1000:1000 /data/tasks.sqlite
"${compose[@]}" up -d --wait --wait-timeout 90 app app-peer >> "$report/lifecycle.log" 2>&1
"${compose[@]}" run --rm -T client node test/deployment/lifecycle.mjs verify >> "$report/lifecycle.log" 2>&1

# Missing preconditions are failures, never silently skipped success.
set +e
docker run --rm --network none "hexu-ci-fixture:$HEXU_CI_TAG" > "$report/negative-disabled.log" 2>&1
no_opt_in=$?
docker run --rm --network none -e HEXU_CI_FIXTURE=1 "hexu-ci-fixture:$HEXU_CI_TAG" > "$report/negative-credentials.log" 2>&1
no_credentials=$?
set -e
test "$no_opt_in" -ne 0 && test "$no_credentials" -ne 0
grep -q CI_FIXTURE_ONLY "$report/negative-disabled.log"
grep -q ENOENT "$report/negative-credentials.log"
node --input-type=module -e '
import {writeFileSync} from "node:fs";
writeFileSync("ci-results/deployment/lifecycle.json",JSON.stringify({source:process.env.HEXU_SOURCE_SHA,scope:"compiled-core-ci-fixture-not-product-deployment",checks:["non-root-compiled-artifact","export-load-identity","clean-start","real-http-functional-tests","two-process-database-access","abrupt-kill-restart","container-recreate","offline-backup-fresh-volume-restore","missing-opt-in-fails","missing-credentials-fails"],passed:true},null,2)+"\n");'
echo 'Compiled-core deployment checks passed. Full Web/Pi/Host acceptance remains separate.'
