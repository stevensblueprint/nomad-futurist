#!/usr/bin/env bash
# Start or stop a disposable PostgreSQL 18 for tests. The password is a local throwaway value.
set -euo pipefail
NAME=nomad-test-pg
PORT=55432
case "${1:-}" in
  start)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test -p "127.0.0.1:${PORT}:5432" postgres:18 >/dev/null
    deadline=$((SECONDS + 60))
    until docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; do
      if (( SECONDS >= deadline )); then
        echo "error: PostgreSQL did not become ready within 60 seconds" >&2
        exit 1
      fi
      sleep 1
    done
    echo "export TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:${PORT}/postgres"
    ;;
  stop) docker rm -f "$NAME" >/dev/null ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
