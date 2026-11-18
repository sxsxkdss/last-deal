#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

repo_url="${LAST_DEAL_REPO:-https://github.com/sxsxkdss/last-deal.git}"
branch="${LAST_DEAL_BRANCH:-main}"
site="${LAST_DEAL_ROOT:-/var/lib/last-deal}"
if (( EUID == 0 )); then
  echo 'Run the updater as the last-deal service user.' >&2
  exit 1
fi
git check-ref-format "refs/heads/$branch" >/dev/null
mkdir -p -- "$site/releases"
exec 9>"$site/deploy.lock"
flock -n 9 || exit 0

mirror="$site/repository.git"
if [[ ! -f "$mirror/HEAD" ]]; then
  git init --bare --quiet "$mirror"
fi
GIT_TERMINAL_PROMPT=0 git --git-dir="$mirror" fetch --no-tags --depth=1 "$repo_url" "refs/heads/$branch"
commit=$(git --git-dir="$mirror" rev-parse --verify 'FETCH_HEAD^{commit}')
release="$site/releases/$commit"

if [[ ! -s "$release/index.html" ]]; then
  stage=$(mktemp -d "$site/.build.XXXXXXXX")
  cleanup() { rm -rf -- "$stage"; }
  trap cleanup EXIT

  git --git-dir="$mirror" archive "$commit" | tar -xf - -C "$stage"
  (
    cd "$stage"
    npm ci --no-audit --no-fund
    npm run build
    test -s dist/index.html
    test -d dist/assets
  )
  mv -T -- "$stage/dist" "$release"
fi

if [[ "$(readlink "$site/current" || true)" != "releases/$commit" ]]; then
  link_dir=$(mktemp -d "$site/.link.XXXXXXXX")
  ln -s "releases/$commit" "$link_dir/current"
  mv -Tf -- "$link_dir/current" "$site/current"
  rmdir -- "$link_dir"
  printf 'Published %s\n' "$commit"
fi
