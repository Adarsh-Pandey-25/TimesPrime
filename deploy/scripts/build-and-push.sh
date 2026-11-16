#!/usr/bin/env bash
# Builds the three images on this laptop for the server (linux/amd64) and pushes them to ECR.
# The tag is the commit's SHA, so an image always matches a commit, and each image is built with
# the public NEXT_PUBLIC_ values from deploy/env/.env.build (git-ignored; template:
# deploy/env/build.env.example). Secrets are never build arguments: the server sets them at run
# time from its own env files.
#
#   deploy/scripts/build-and-push.sh             build and push; prints the tag to deploy
#   deploy/scripts/build-and-push.sh --no-push   build only, to run them locally first (run-local.sh)
#
# Needs: Docker with buildx, the AWS CLI signed in (aws sso login) with push rights on the three
# ECR repositories, and a clean working tree.
set -euo pipefail

PUSH=1
[ "${1:-}" = "--no-push" ] && PUSH=0

cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain)" ]; then
  echo "The working tree has changes: commit or stash them, so the image matches a commit." >&2
  exit 1
fi

BUILD_ENV=deploy/env/.env.build
[ -f "$BUILD_ENV" ] || { echo "Missing $BUILD_ENV (copy deploy/env/build.env.example and fill it)." >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$BUILD_ENV"
set +a
: "${ECR_REGISTRY:?set ECR_REGISTRY in $BUILD_ENV}"
: "${NEXT_PUBLIC_SUPABASE_URL:?set NEXT_PUBLIC_SUPABASE_URL in $BUILD_ENV}"
: "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?set NEXT_PUBLIC_SUPABASE_ANON_KEY in $BUILD_ENV}"
: "${NEXT_PUBLIC_APP_URL:?set NEXT_PUBLIC_APP_URL in $BUILD_ENV}"

TAG="$(git rev-parse --short=12 HEAD)"

if [ "$PUSH" = 1 ]; then
  aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin "$ECR_REGISTRY"
fi

for target in web admin worker; do
  echo "== timesprime-$target:$TAG"
  docker buildx build \
    --platform linux/amd64 \
    --target "$target" \
    --build-arg NEXT_DEPLOYMENT_ID="$TAG" \
    --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
    --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    --build-arg NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL" \
    --build-arg NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN:-}" \
    --build-arg NEXT_PUBLIC_AI_CHAT_ENABLED="${NEXT_PUBLIC_AI_CHAT_ENABLED:-}" \
    --tag "$ECR_REGISTRY/timesprime-$target:$TAG" \
    "$([ "$PUSH" = 1 ] && echo --push || echo --load)" \
    .
done

echo
echo "Built tag: $TAG"
if [ "$PUSH" = 1 ]; then
  echo "On the server (Session Manager): sudo bash /opt/timesprime/current/scripts/deploy.sh $TAG"
else
  echo "Run them locally first: deploy/scripts/run-local.sh $TAG"
fi
