"""Password hashing and JWT behaviour."""
import pytest

from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class TestPasswords:
    def test_round_trip(self):
        h = hash_password("correct horse battery staple")
        assert verify_password("correct horse battery staple", h)

    def test_wrong_password_rejected(self):
        assert not verify_password("nope", hash_password("secret"))

    def test_hash_is_salted(self):
        assert hash_password("same") != hash_password("same")

    def test_malformed_hash_reads_as_wrong_password(self):
        # Must not raise: a corrupt row should be a 401, never a 500.
        assert not verify_password("secret", "not-a-bcrypt-hash")

    def test_long_password_does_not_crash(self):
        # bcrypt caps at 72 bytes; we truncate rather than let it raise.
        long_password = "a" * 200
        assert verify_password(long_password, hash_password(long_password))


class TestTokens:
    def test_access_token_round_trip(self):
        token = create_access_token(42, {"role": "ADMIN", "employee_id": 7})
        claims = decode_token(token, expected_type="access")
        assert claims["sub"] == "42"
        assert claims["role"] == "ADMIN"
        assert claims["employee_id"] == 7

    def test_refresh_token_cannot_be_used_as_access_token(self):
        refresh = create_refresh_token(1)
        with pytest.raises(TokenError):
            decode_token(refresh, expected_type="access")

    def test_garbage_token_rejected(self):
        with pytest.raises(TokenError):
            decode_token("clearly.not.a.jwt")

    def test_tampered_token_rejected(self):
        token = create_access_token(1)
        with pytest.raises(TokenError):
            decode_token(token[:-4] + "AAAA")

    def test_tokens_are_unique_per_issue(self):
        assert create_access_token(1) != create_access_token(1)
