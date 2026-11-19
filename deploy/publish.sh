#!/usr/bin/env bash
set -Eeuo pipefail

site="${LAST_DEAL_ROOT:-/var/lib/last-deal}"
port="${LAST_DEAL_PORT:-3000}"
url="http://127.0.0.1:$port/healthz"
unit=last-deal-server.service
exec 9>"$site/publish.lock"
flock -n 9 || exit 0
read -r commit < "$site/candidate"
[[ "$commit" =~ ^[a-f0-9]{40}$ ]]
[[ -s "$site/releases/$commit/index.html" && -f "$site/runtime/$commit/server/main.ts" ]]

old_runtime=$(readlink "$site/runtime-current" || true)
old_site=$(readlink "$site/current" || true)
drain="${LAST_DEAL_DRAIN_FILE:-$site/drain}"

swap_link() {
  local dir
  dir=$(mktemp -d "$site/.publish.XXXXXXXX")
  ln -s "$1" "$dir/link"
  mv -Tf -- "$dir/link" "$site/$2"
  rmdir "$dir"
}

health() {
  local expected="${1:-}"
  curl -fsS --max-time 2 "$url" | node -e '
    let s = "";
    process.stdin.on("data", chunk => s += chunk);
    process.stdin.on("end", () => {
      try {
        const h = JSON.parse(s);
        const expected = process.argv[1];
        if (h.ok !== true || h.protocol !== 1 || h.draining !== true ||
            (expected && h.release !== expected) ||
            !Number.isInteger(h.active) || h.active < 0) process.exit(1);
        console.log(h.active);
      } catch { process.exit(1); }
    });
  ' -- "$expected"
}

wait_for_health() {
  local expected="${1:-}"
  for _ in {1..20}; do
    if health "$expected" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

if [[ "$old_runtime" == "runtime/$commit" && "$old_site" == "releases/$commit" ]]; then
  if [[ -e "$drain" ]]; then
    health "$commit" >/dev/null
    unlink "$drain"
  fi
  exit 0
fi

touch "$drain"
if [[ -n "$old_runtime" ]]; then
  if ! games=$(health); then
    echo 'Cannot verify the active matches of the running server. Publication paused.' >&2
    exit 1
  fi
  if (( games > 0 )); then
    printf 'Waiting for %s active matches before publishing %s\n' "$games" "$commit"
    exit 0
  fi
fi

swap_link "runtime/$commit" runtime-current
if ! systemctl restart "$unit" || ! wait_for_health "$commit"; then
  echo "Server health check failed for $commit" >&2
  if [[ -n "$old_runtime" ]]; then
    swap_link "$old_runtime" runtime-current
    if ! systemctl restart "$unit" || ! wait_for_health; then
      echo 'The previous server failed its health check. New matches remain paused.' >&2
      exit 1
    fi
  else
    systemctl stop "$unit"
    unlink "$site/runtime-current"
  fi
  unlink "$drain"
  exit 1
fi

if [[ -n "$old_site" ]]; then
  swap_link "$old_site" previous
fi
swap_link "releases/$commit" current
unlink "$drain"
printf 'Published server and site %s\n' "$commit"
