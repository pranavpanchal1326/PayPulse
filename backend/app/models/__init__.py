"""Importing this package registers every model on the shared metadata.

Alembic autogenerate and `Base.metadata.create_all` both depend on it.
"""
from app.models.user import User

__all__ = ["User"]
