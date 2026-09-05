#!/usr/bin/env bash
set -euo pipefail

echo "[entrypoint] waiting for postgres at ${POSTGRES_HOST:-db}:${POSTGRES_PORT:-5432}"
python - <<'PY'
import os, socket, sys, time

host = os.getenv("POSTGRES_HOST", "db")
port = int(os.getenv("POSTGRES_PORT", "5432"))
deadline = time.time() + 60

while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=2):
            print("[entrypoint] postgres is accepting connections")
            sys.exit(0)
    except OSError:
        time.sleep(1)

print(f"[entrypoint] timed out waiting for {host}:{port}", file=sys.stderr)
sys.exit(1)
PY

echo "[entrypoint] running migrations"
alembic upgrade head

echo "[entrypoint] starting: $*"
exec "$@"
