#!/usr/bin/env bash
# Start or stop a disposable PostgreSQL 18 for tests. The password is a local throwaway value.
set -euo pipefail
NAME=nomad-test-pg
PORT=55432
case "${1:-}" in
  start)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test -p "127.0.0.1:${PORT}:5432" postgres:18 >/dev/null
    until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
    echo "export TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:${PORT}/postgres"
    ;;
  stop) docker rm -f "$NAME" >/dev/null ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
