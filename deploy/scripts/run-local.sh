#!/usr/bin/env bash
# Before every deploy (instead of a staging server): run the exact images of a tag on this laptop
# with the same compose file, then check them in a browser.
#
#   deploy/scripts/build-and-push.sh --no-push     builds the tag's images locally
#   deploy/scripts/run-local.sh <tag>              starts them: reader http://localhost:3200,
#                                                  back office http://localhost:3201/admin
#   deploy/scripts/run-local.sh <tag> down         stops them
#
# Nginx is not started (no certificates here) and the refresh job is never run (it writes to the
# database). The env files are deploy/env/.env.* on this laptop, git-ignored, from the templates
# in deploy/env. With the real database's values the apps read it, as the reader does.
set -euo pipefail

TAG="${1:?usage: run-local.sh <tag> [down]}"
cd "$(git rev-parse --show-toplevel)"
set -a
# shellcheck disable=SC1091
. deploy/env/.env.build # ECR_REGISTRY, so the image names match the built ones
set +a

RELEASE=deploy/env/.env.release-local
# Docker on Windows needs C:/... rather than Git Bash's /c/...: pwd -W gives it there.
HERE="$(pwd -W 2>/dev/null || pwd)"
printf 'ECR_REGISTRY=%s\nTAG=%s\nENV_DIR=%s\n' "$ECR_REGISTRY" "$TAG" "$HERE/deploy/env" >"$RELEASE"

compose() { docker compose -p timesprime-local -f deploy/compose.yml -f deploy/compose.local.yml --env-file "$RELEASE" "$@"; }
if [ "${2:-}" = "down" ]; then
  compose down
  exit 0
fi
compose up -d
echo "Reader: http://localhost:3200   Back office: http://localhost:3201/admin"
echo "Stop:   deploy/scripts/run-local.sh $TAG down"
