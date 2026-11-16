#!/usr/bin/env bash
# One command back to the tag that ran before the last deploy:
#
#   sudo bash /opt/timesprime/current/scripts/rollback.sh
#
# It deploys PREVIOUS_TAG from release.env with that tag's own kit, so the configuration rolls back
# with the images. Run it again to return to the tag you rolled back from.
set -euo pipefail

BASE=/opt/timesprime
PREVIOUS="$(sed -n 's/^PREVIOUS_TAG=//p' "$BASE/release.env")"
if [ -z "$PREVIOUS" ]; then
  echo "No previous tag in $BASE/release.env: nothing to roll back to." >&2
  exit 1
fi
echo "Rolling back to $PREVIOUS"
exec bash "$BASE/kits/$PREVIOUS/scripts/deploy.sh" "$PREVIOUS"
