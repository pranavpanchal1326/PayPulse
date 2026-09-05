"""Guards on the demo fixtures.

The seeded accounts are the only way into the app during a demo, so a bad
address here is a demo-stopper rather than a cosmetic problem.
"""
import pytest
from pydantic import TypeAdapter
from pydantic.networks import EmailStr

from app.core.enums import Role
from app.db.seed import DEMO_PASSWORD, SEED_USERS

_email = TypeAdapter(EmailStr)


@pytest.mark.parametrize("email,name,role", SEED_USERS, ids=lambda v: str(v))
def test_seeded_email_passes_the_same_validation_as_the_login_endpoint(
    email, name, role
):
    # LoginRequest.email is an EmailStr, so anything it rejects can never log
    # in. Reserved TLDs such as .local are rejected -- that bit once already.
    _email.validate_python(email)


def test_one_account_per_role():
    assert {role for _, _, role in SEED_USERS} == set(Role)


def test_emails_are_unique():
    emails = [email for email, _, _ in SEED_USERS]
    assert len(emails) == len(set(emails))


def test_emails_are_lowercase():
    # login() looks up `email.lower()`, so a capitalised seed would never match.
    assert all(email == email.lower() for email, _, _ in SEED_USERS)


def test_every_account_has_a_display_name():
    assert all(name.strip() for _, name, _ in SEED_USERS)


def test_demo_password_is_set():
    assert DEMO_PASSWORD
