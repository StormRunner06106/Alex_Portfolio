"""Vercel ASGI entrypoint; the React build is served separately by the CDN."""
from backend.main import app

__all__ = ["app"]
