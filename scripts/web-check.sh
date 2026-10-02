#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
: "${HEXU_CI_TAG:?unique test tag required}"
: "${HEXU_SOURCE_SHA:?source SHA required}"
case "$HEXU_CI_TAG" in *[!a-zA-Z0-9_.-]*|'') exit 1;; esac
export HEXU_CI_UID="$(id -u)" HEXU_CI_GID="$(id -g)"
project="hexu-web-${HEXU_CI_TAG,,}"
report="$PWD/ci-results/browser"
private="$PWD/ci-results/web-private"
mkdir -p "$report" "$private"
# All identities are short-lived synthetic CI data; directory is never an artifact.
chmod 777 "$private"
compose=(docker compose -p "$project" -f compose.web.ci.yaml)
cleanup(){
  local status=$?
  trap - EXIT
  "${compose[@]}" logs --no-color app > "$report/server.log" 2>&1 || :
  if ! "${compose[@]}" down --volumes --remove-orphans > "$report/cleanup.log" 2>&1; then status=1; fi
  rm -f "$private/accounts.json" "$private/seed.json" "$private/restart-session.json"
  printf '%s\n' "$status" > "$report/exit-code.txt"
  exit "$status"
}
trap cleanup EXIT
node --input-type=module -e 'import {randomBytes} from "node:crypto";import {writeFileSync} from "node:fs";writeFileSync("ci-results/web-private/accounts.json",JSON.stringify(Object.fromEntries(["owner","member","outsider"].map(n=>[n,randomBytes(24).toString("hex")]))),{mode:0o644});'
"${compose[@]}" build app browser 2>&1 | tee "$report/build.log"
"${compose[@]}" run --rm -T seed > "$report/seed.log" 2>&1
"${compose[@]}" up -d --wait --wait-timeout 90 app > "$report/startup.log" 2>&1
"${compose[@]}" run --rm -T browser 2>&1 | tee "$report/browser.log"
node scripts/browser-report.mjs "$report/results.json"
{
  "${compose[@]}" run --rm -T check node /checks/restart.mjs prepare
  "${compose[@]}" kill -s SIGKILL app
  "${compose[@]}" up -d --wait --wait-timeout 90 app
  "${compose[@]}" run --rm -T check node /checks/restart.mjs verify
  "${compose[@]}" up -d --force-recreate --wait --wait-timeout 90 app
  "${compose[@]}" run --rm -T check node /checks/restart.mjs verify
} > "$report/restart.log" 2>&1
node --input-type=module -e 'import {writeFileSync} from "node:fs";writeFileSync("ci-results/browser/evidence.json",JSON.stringify({source:process.env.HEXU_SOURCE_SHA,entry:"bin/server.mjs",browser:process.env.HEXU_BROWSER??"chromium",scope:"real-web-login-projects-members-comments-review; synthetic preloaded deliveries; no Pi/Host",restart:true,passed:true},null,2));'
