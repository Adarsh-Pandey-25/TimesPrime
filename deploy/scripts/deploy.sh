#!/usr/bin/env bash
# Deploys one tag on the server. Run in a Session Manager shell, after Adarsh approves the deploy:
#
#   sudo bash /opt/timesprime/current/scripts/deploy.sh <tag>
#
# The first time, before /opt/timesprime/current exists, take this script from the image itself
# (docs/OPERATIONS.md, Deployment). It:
#   1. pulls the tag's worker image and copies its deploy kit (this folder) to kits/<tag>;
#   2. records the tag, and the one it replaces, in release.env (rollback.sh uses that);
#   3. points current/ at the kit and installs the refresh timer;
#   4. pulls the tag's images and starts them;
#   5. waits for the reader site and the back office to report healthy.
# The server only pulls: images are never built here.
set -euo pipefail

TAG="${1:?usage: deploy.sh <tag>}"
BASE=/opt/timesprime
# shellcheck disable=SC1091
. "$BASE/server.conf" # ECR_REGISTRY=..., written once by the runbook
: "${ECR_REGISTRY:?set ECR_REGISTRY in $BASE/server.conf}"
ENV_DIR="$BASE/env"

aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null

# 1. The deploy kit of this tag, from the worker image (it carries deploy/ at /deploy).
docker pull --quiet "$ECR_REGISTRY/timesprime-worker:$TAG" >/dev/null
KIT="$BASE/kits/$TAG"
if [ ! -d "$KIT" ]; then
  container="$(docker create "$ECR_REGISTRY/timesprime-worker:$TAG")"
  mkdir -p "$KIT"
  docker cp "$container:/deploy/." "$KIT/"
  docker rm "$container" >/dev/null
fi

# 2. The release: this tag, and the one to go back to.
CURRENT=""
[ -f "$BASE/release.env" ] && CURRENT="$(sed -n 's/^TAG=//p' "$BASE/release.env")"
PREVIOUS="$CURRENT"
[ "$CURRENT" = "$TAG" ] && PREVIOUS="$(sed -n 's/^PREVIOUS_TAG=//p' "$BASE/release.env")"
cat >"$BASE/release.env.new" <<EOF
ECR_REGISTRY=$ECR_REGISTRY
TAG=$TAG
PREVIOUS_TAG=$PREVIOUS
ENV_DIR=$ENV_DIR
COMPOSE_PROFILES=edge
EOF
mv "$BASE/release.env.new" "$BASE/release.env"

# 3. current/ is this kit; the refresh timer comes from it.
ln -sfn "$KIT" "$BASE/current"
install -m 0644 "$KIT/systemd/timesprime-refresh.service" "$KIT/systemd/timesprime-refresh.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now timesprime-refresh.timer >/dev/null

# 4. Start this tag.
cd "$BASE/current"
compose() { docker compose --env-file "$BASE/release.env" --profile edge "$@"; }
compose pull --quiet
compose up -d --remove-orphans

# 5. Healthy within three minutes, or say so.
for _ in $(seq 1 36); do
  health="$(compose ps web admin --format '{{.Health}}' | sort -u | tr '\n' ' ')"
  if [ "$health" = "healthy " ]; then
    echo "Deployed $TAG (previous: ${PREVIOUS:-none}). web and admin are healthy."
    exit 0
  fi
  sleep 5
done
compose ps
echo "web and admin are not healthy after three minutes ($health)." >&2
echo "Go back to ${PREVIOUS:-the previous tag}: sudo bash $BASE/current/scripts/rollback.sh" >&2
exit 1
