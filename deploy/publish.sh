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
  curl -fsS --max-time 2 "$url" | node -e '
    let s = "";
    process.stdin.on("data", chunk => s += chunk);
    process.stdin.on("end", () => {
      try {
        const h = JSON.parse(s);
        if (h.ok !== true || h.protocol !== 1 || h.draining !== true ||
            !Number.isInteger(h.active) || h.active < 0) process.exit(1);
        console.log(h.active);
      } catch { process.exit(1); }
    });
  '
}

if [[ "$old_runtime" == "runtime/$commit" && "$old_site" == "releases/$commit" ]]; then
  exit 0
fi

touch "$drain"
if [[ -n "$old_runtime" ]]; then
  games=$(health)
  if (( games > 0 )); then
    printf 'Waiting for %s active matches before publishing %s\n' "$games" "$commit"
    exit 0
  fi
fi

swap_link "runtime/$commit" runtime-current
healthy=0
if systemctl restart "$unit"; then
  for _ in {1..20}; do
    if health >/dev/null 2>&1; then
      healthy=1
      break
    fi
    sleep 0.5
  done
fi
if (( ! healthy )); then
  if [[ -n "$old_runtime" ]]; then
    swap_link "$old_runtime" runtime-current
    systemctl restart "$unit"
  else
    systemctl stop "$unit"
    unlink "$site/runtime-current"
  fi
  unlink "$drain"
  echo "Server health check failed for $commit" >&2
  exit 1
fi

if [[ -n "$old_site" ]]; then
  swap_link "$old_site" previous
fi
swap_link "releases/$commit" current
unlink "$drain"
printf 'Published server and site %s\n' "$commit"
