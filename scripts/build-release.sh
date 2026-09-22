#!/usr/bin/env bash
set -Eeuo pipefail

BRANCH="${BRANCH:-feature/client-reporting-v0.5.0}"
SOURCE_REPO="${SOURCE_REPO:-/opt/utilities/3cx-call-quality-analyser-v050}"
LIVE_DIR="${LIVE_DIR:-/opt/utilities/3cx-call-quality-analyser}"
IMAGE="${IMAGE:-3cx-call-quality-analyser:latest}"
CONTAINER="${CONTAINER:-3cx-call-quality-analyser}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4180/api/health}"

echo "==> Updating source from $BRANCH"
git -C "$SOURCE_REPO" fetch origin
git -C "$SOURCE_REPO" reset --hard "origin/$BRANCH"

echo "==> Synchronising application source"
mkdir -p "$LIVE_DIR/public"
cp "$SOURCE_REPO"/public/index.html "$LIVE_DIR/public/index.html"
cp "$SOURCE_REPO"/public/app.js "$LIVE_DIR/public/app.js"
cp "$SOURCE_REPO"/public/app.css "$LIVE_DIR/public/app.css"
cp "$SOURCE_REPO"/public/reporting.js "$LIVE_DIR/public/reporting.js"
cp "$SOURCE_REPO"/Dockerfile "$LIVE_DIR/Dockerfile"
cp "$SOURCE_REPO"/nginx.conf "$LIVE_DIR/nginx.conf"
cp "$SOURCE_REPO"/VERSION "$LIVE_DIR/VERSION"

VERSION="$(tr -d '\r\n' < "$LIVE_DIR/VERSION")"
echo "==> Building $IMAGE (v$VERSION)"
docker build --no-cache -t "$IMAGE" "$LIVE_DIR"

LATEST_ID="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
echo "Built image: $LATEST_ID"

if [[ "${1:-}" == "--verify" ]]; then exec "$(dirname "$0")/verify-deployment.sh"; fi

if docker inspect "$CONTAINER" >/dev/null 2>&1; then
  RUNNING_ID="$(docker inspect "$CONTAINER" --format '{{.Image}}')"
  if [[ "$RUNNING_ID" != "$LATEST_ID" ]]; then
    echo
    echo "BUILD COMPLETE — PORTAINER REDEPLOY REQUIRED"
    echo "Running: $RUNNING_ID"
    echo "Latest : $LATEST_ID"
    echo "Update the existing Portainer stack with image pulling disabled."
    echo "Then rerun: $0 --verify"
    exit 2
  fi
fi

"$0" --verify
