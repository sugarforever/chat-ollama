#!/bin/sh
# Run from rewrite/ on a disposable Docker installation. No model/MCP fixtures required.
set -eu
export COMPOSE_PROJECT_NAME=pi-rewrite-smoke-$$

export ORIGIN=http://localhost:3000
export PORT=3000
cleanup() {
  docker compose logs app || true
  docker compose down -v
}
trap cleanup EXIT
wait_ready() {
  attempts=0
  until curl --fail --silent "$ORIGIN/" >/dev/null; do
    attempts=$((attempts + 1))
    [ "$attempts" -lt 60 ] || return 1
    sleep 1
  done
}
docker compose up --build -d
wait_ready
curl --fail --silent -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  --data '{"name":"container-persistence-marker"}' "$ORIGIN/api/knowledge-bases" >/dev/null
docker compose kill -s SIGKILL app
docker compose up -d
wait_ready
curl --fail --silent "$ORIGIN/api/knowledge-bases" | \
  node --input-type=module -e 'let value=""; for await (const part of process.stdin) value += part; if (!JSON.parse(value).some(c => c.name === "container-persistence-marker")) process.exit(1);'
