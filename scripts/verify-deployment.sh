#!/usr/bin/env bash
set -Eeuo pipefail
IMAGE="${IMAGE:-3cx-call-quality-analyser:latest}"
CONTAINER="${CONTAINER:-3cx-call-quality-analyser}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4180/api/health}"
LATEST_ID="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
RUNNING_ID="$(docker inspect "$CONTAINER" --format '{{.Image}}')"
echo "Running: $RUNNING_ID"
echo "Latest : $LATEST_ID"
[[ "$RUNNING_ID" == "$LATEST_ID" ]] || { echo "ERROR: running container is stale"; exit 3; }
HEALTH="$(curl -fsS "$HEALTH_URL")"
echo "Health : $HEALTH"
VERSION="$(docker exec "$CONTAINER" sh -c "grep -o 'v[0-9][0-9.]* · Standalone' /usr/share/nginx/html/index.html | head -1" || true)"
echo "UI     : ${VERSION:-version marker not found}"
echo "Deployment verified."
