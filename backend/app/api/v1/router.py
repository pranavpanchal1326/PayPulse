"""Aggregates every v1 router. Feature routers get mounted here as they land."""
from fastapi import APIRouter

from app.api.v1 import auth

api_router = APIRouter()
api_router.include_router(auth.router)
