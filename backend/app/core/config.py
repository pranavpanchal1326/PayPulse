"""Application settings, loaded from environment / .env."""
from functools import lru_cache

from pydantic import computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Obvious placeholder, long enough to satisfy HS256 in local development.
DEV_SECRET_KEY = "dev-only-insecure-key-change-me-before-deploying-anywhere"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- app ---
    APP_NAME: str = "PayPulse"
    # Every timestamp is stored UTC; this is the zone dates are bucketed in.
    # A 20:30 UTC check-in is the next calendar day in Kolkata, so getting
    # this wrong moves attendance into the wrong payroll period.
    APP_TIMEZONE: str = "Asia/Kolkata"
    API_V1_PREFIX: str = "/api/v1"
    ENV: str = "development"
    DEBUG: bool = True

    # --- security ---
    # HS256 needs >= 32 bytes of key material (RFC 7518 3.2); PyJWT warns below
    # that. This default keeps local dev quiet and is rejected outside dev by
    # the validator below.
    SECRET_KEY: str = DEV_SECRET_KEY
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- database ---
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "peoplepay"
    POSTGRES_PASSWORD: str = "peoplepay"
    POSTGRES_DB: str = "peoplepay360"
    DATABASE_URL: str | None = None

    # --- cors ---
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- mail ---
    SMTP_HOST: str = "mailhog"
    SMTP_PORT: int = 1025
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_TLS: bool = False
    MAIL_FROM: str = "payroll@paypulse.app"
    MAIL_FROM_NAME: str = "PayPulse Payroll"

    # --- attendance ---
    # Grace after the scheduled start before a check-in counts as LATE.
    LATE_GRACE_MINUTES: int = 15
    # Scheduled days with no attendance row and no approved leave: whether
    # they reduce pay. See AbsencePolicy.
    PAYROLL_ABSENCE_POLICY: str = "TREAT_AS_UNPAID"

    # --- company (payslip header) ---
    COMPANY_NAME: str = "PayPulse Technologies Pvt. Ltd."
    CURRENCY: str = "INR"
    CURRENCY_SYMBOL: str = "\u20b9"

    @model_validator(mode="after")
    def _reject_default_secret_outside_dev(self) -> "Settings":
        if self.ENV != "development" and self.SECRET_KEY == DEV_SECRET_KEY:
            raise ValueError(
                f"SECRET_KEY is still the development placeholder but ENV="
                f"{self.ENV!r}. Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sqlalchemy_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
