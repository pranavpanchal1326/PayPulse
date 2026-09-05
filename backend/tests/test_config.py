"""Settings behaviour that protects the deployment."""
import pytest

from app.core.config import DEV_SECRET_KEY, Settings


def test_dev_secret_is_long_enough_for_hs256():
    # RFC 7518 3.2 requires >= 32 bytes; PyJWT warns below that.
    assert len(DEV_SECRET_KEY.encode()) >= 32


def test_default_secret_allowed_in_development():
    settings = Settings(ENV="development", _env_file=None)
    assert settings.SECRET_KEY == DEV_SECRET_KEY


@pytest.mark.parametrize("env", ["production", "staging"])
def test_default_secret_rejected_outside_development(env):
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(ENV=env, _env_file=None)


def test_real_secret_accepted_outside_development():
    settings = Settings(ENV="production", SECRET_KEY="x" * 48, _env_file=None)
    assert settings.ENV == "production"


def test_database_url_overrides_discrete_postgres_settings():
    settings = Settings(
        DATABASE_URL="postgresql+psycopg://u:p@somewhere:5432/db", _env_file=None
    )
    assert settings.sqlalchemy_url == "postgresql+psycopg://u:p@somewhere:5432/db"


def test_sqlalchemy_url_built_from_parts():
    settings = Settings(
        POSTGRES_USER="u",
        POSTGRES_PASSWORD="p",
        POSTGRES_HOST="db",
        POSTGRES_PORT=5432,
        POSTGRES_DB="ppay",
        _env_file=None,
    )
    assert settings.sqlalchemy_url == "postgresql+psycopg://u:p@db:5432/ppay"


def test_cors_origins_parsed_into_list():
    settings = Settings(CORS_ORIGINS="http://a.test, http://b.test ,", _env_file=None)
    assert settings.cors_origin_list == ["http://a.test", "http://b.test"]
