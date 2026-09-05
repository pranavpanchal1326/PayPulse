"""Shared harness for the smoke scripts.

Each of these scripts had its own copy of check/call/login plus a pair of
counters. The copies had drifted - different column widths, some with a
`detail` argument and some without - which is the usual way duplicated test
plumbing rots. One copy here instead.

smoke_auth.py deliberately does not use this: its check() and call() take
their arguments in the opposite order and it needs a custom opener, so
converting it would mean rewriting every call site to save nothing.

These talk to a *running* stack over real HTTP on purpose. They cover what a
TestClient cannot: real Postgres constraints, real middleware, real status
codes on the wire.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request

BASE = "http://localhost:8000/api/v1"
PASSWORD = "paypulse"

passed = 0
failed = 0


def check(ok, label, detail: str = "") -> bool:
    """Record one assertion and print it. Returns the boolean it was given."""
    global passed, failed
    ok = bool(ok)
    passed, failed = passed + ok, failed + (not ok)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{f'  [{detail}]' if detail else ''}")
    return ok


def call(method, path, token=None, body=None, expect=200):
    """One API call, asserted against `expect`. Returns the decoded body."""
    request = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            status, payload = response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        status, payload = exc.code, json.loads(exc.read() or b"{}")

    if not check(status == expect, f"{method:6} {path:46} -> {status}"):
        print(f"        expected {expect}, body={payload}")
    return payload


def login(email: str) -> str:
    return call(
        "POST", "/auth/login", body={"email": email, "password": PASSWORD}
    )["access_token"]


def finish(title: str) -> int:
    """Print the tally. Returns a process exit code."""
    print("\n" + "=" * 46)
    print(f"  {title}: {passed} passed, {failed} failed")
    print("=" * 46)
    return 1 if failed else 0
