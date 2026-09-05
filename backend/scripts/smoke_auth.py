"""End-to-end smoke test of the auth flow against a RUNNING api container.

Unlike tests/, this talks to the real stack over HTTP, so it exercises
migrations, seeding, JSON serialisation and the error envelope together.

    docker compose up -d
    docker compose exec -T api python -m app.db.seed
    python backend/scripts/smoke_auth.py

Base URL defaults to http://127.0.0.1:8000; override with argv[1] or
SMOKE_BASE_URL.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = (
    sys.argv[1]
    if len(sys.argv) > 1
    else os.getenv("SMOKE_BASE_URL", "http://127.0.0.1:8000")
).rstrip("/")

# Empty ProxyHandler: without it, urllib does Windows registry proxy
# auto-detection on every call, which hangs for minutes here.
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

PASSWORD = "paypulse"
ACCOUNTS = [
    ("admin@paypulse.app", "ADMIN"),
    ("payroll.manager@paypulse.app", "HR_PAYROLL_MANAGER"),
    ("payroll.user@paypulse.app", "HR_PAYROLL_USER"),
    ("hr.manager@paypulse.app", "HR_MANAGER"),
    ("employee@paypulse.app", "EMPLOYEE"),
]

ok = fail = 0


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with opener.open(req, data, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return e.code, {"raw": raw[:200].decode("utf-8", "replace")}


def check(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  PASS  {label}")
    else:
        fail += 1
        print(f"  FAIL  {label}  -> {detail}")


def main() -> int:
    print(f"smoke testing {BASE}\n")

    print("health & contract")
    s, b = call("GET", "/healthz")
    check("/healthz 200 + db up", s == 200 and b.get("database") == "up", b)
    check("/openapi.json served (Pranav's contract)",
          call("GET", "/openapi.json")[0] == 200)

    print("\nlogin")
    s, b = call("POST", "/api/v1/auth/login",
                {"email": "admin@paypulse.app", "password": PASSWORD})
    check("admin login 200", s == 200, b)
    check("returns access+refresh+user",
          {"access_token", "refresh_token", "user"} <= set(b), list(b))
    check("user.role is ADMIN", b.get("user", {}).get("role") == "ADMIN", b.get("user"))
    access, refresh = b.get("access_token"), b.get("refresh_token")

    s, b = call("POST", "/api/v1/auth/login",
                {"email": "admin@paypulse.app", "password": "wrong"})
    check("wrong password 401", s == 401, (s, b))
    check("error envelope carries code", b.get("code") == "unauthenticated", b)

    s, b = call("POST", "/api/v1/auth/login",
                {"email": "nobody@example.com", "password": PASSWORD})
    check("unknown user: identical message (no enumeration)",
          s == 401 and b.get("message") == "Incorrect email or password", b)

    s, b = call("POST", "/api/v1/auth/login", {"email": "not-an-email", "password": "x"})
    check("invalid email 422 validation envelope",
          s == 422 and b.get("code") == "validation_error" and b.get("field_errors"), b)

    print("\n/me")
    s, b = call("GET", "/api/v1/auth/me", token=access)
    check("with token 200", s == 200, b)
    check("returns the admin", b.get("email") == "admin@paypulse.app", b)
    check("no token 401", call("GET", "/api/v1/auth/me")[0] == 401)
    check("garbage token 401",
          call("GET", "/api/v1/auth/me", token="garbage.token.x")[0] == 401)

    print("\nrefresh")
    s, b = call("POST", "/api/v1/auth/refresh", {"refresh_token": refresh})
    check("refresh 200 + new access token", s == 200 and b.get("access_token"), b)
    check("refresh token REJECTED as access token",
          call("GET", "/api/v1/auth/me", token=refresh)[0] == 401)

    print("\nall five seeded roles can log in")
    for email, role in ACCOUNTS:
        s, b = call("POST", "/api/v1/auth/login",
                    {"email": email, "password": PASSWORD})
        check(f"{role:<20} login",
              s == 200 and b.get("user", {}).get("role") == role, (s, b))

    print("\n" + "=" * 46)
    print(f"  {ok} passed, {fail} failed")
    print("=" * 46)
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
