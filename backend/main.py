from __future__ import annotations

import json
import hashlib
import hmac
import os
import re
import smtplib
import ssl
import threading
import time
from datetime import date
from email.message import EmailMessage
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field
from starlette.concurrency import run_in_threadpool


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIST = PROJECT_DIR / "frontend" / "dist"
RESUME_PATH = PROJECT_DIR / "Alexander Herlan Resume 2024.pdf"
POSTS_PATH = DATA_DIR / "posts.json"
POSTS_LOCK = threading.Lock()
ADMIN_TOKEN_TTL = 60 * 60 * 4


app = FastAPI(
    title="Alex Herlan Portfolio API",
    description="JSON-backed content and contact delivery for Alex Herlan's portfolio.",
    version="1.0.0",
)

origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class ContactPayload(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    subject: str = Field(min_length=3, max_length=160)
    message: str = Field(min_length=20, max_length=5000)
    company: str = Field(default="", max_length=200)


class LoginPayload(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class ArticleSection(BaseModel):
    heading: str = Field(min_length=3, max_length=160)
    paragraphs: list[str] = Field(min_length=1, max_length=12)


class NewPostPayload(BaseModel):
    title: str = Field(min_length=5, max_length=160)
    excerpt: str = Field(min_length=20, max_length=360)
    published_at: date
    read_time: int = Field(ge=1, le=60)
    tags: list[str] = Field(min_length=1, max_length=6)
    accent: Literal["blue", "lavender", "peach", "yellow", "mint"] = "mint"
    content: list[ArticleSection] = Field(min_length=1, max_length=8)


@lru_cache(maxsize=8)
def read_data(filename: str) -> Any:
    path = DATA_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=500, detail=f"Missing data file: {filename}")
    return json.loads(path.read_text(encoding="utf-8"))


def journal_credentials() -> tuple[str, str]:
    password = os.getenv("JOURNAL_ADMIN_PASSWORD", "")
    token_secret = os.getenv("JOURNAL_TOKEN_SECRET", "")
    if not password or not token_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Journal publishing is not configured.",
        )
    return password, token_secret


def issue_admin_token() -> tuple[str, int]:
    _, token_secret = journal_credentials()
    expires_at = int(time.time()) + ADMIN_TOKEN_TTL
    payload = str(expires_at)
    signature = hmac.new(
        token_secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"{payload}.{signature}", expires_at


def require_admin(authorization: str | None = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin sign-in required.",
        )

    token = authorization.removeprefix("Bearer ").strip()
    try:
        expires, supplied_signature = token.split(".", maxsplit=1)
        expires_at = int(expires)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin session.",
        )

    _, token_secret = journal_credentials()
    expected_signature = hmac.new(
        token_secret.encode("utf-8"), expires.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    if expires_at <= int(time.time()) or not hmac.compare_digest(
        supplied_signature, expected_signature
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your admin session has expired. Please sign in again.",
        )


def post_slug(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.casefold()).strip("-")
    if not slug:
        raise HTTPException(status_code=422, detail="The title needs letters or numbers.")
    return slug


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/profile")
def profile() -> dict[str, Any]:
    return read_data("profile.json")


@app.get("/api/experience")
def experience() -> list[dict[str, Any]]:
    return read_data("experience.json")


@app.get("/api/skills")
def skills() -> dict[str, Any]:
    return read_data("skills.json")


@app.post("/api/auth/login")
def admin_login(payload: LoginPayload) -> dict[str, Any]:
    password, _ = journal_credentials()
    if not hmac.compare_digest(payload.password, password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That password is not correct.",
        )
    token, expires_at = issue_admin_token()
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires_at,
        "expires_in": ADMIN_TOKEN_TTL,
    }


@app.get("/api/auth/session")
def admin_session(_: None = Depends(require_admin)) -> dict[str, bool]:
    return {"authenticated": True}


@app.get("/api/posts")
def posts(
    q: str | None = Query(default=None, max_length=100),
    tag: str | None = Query(default=None, max_length=50),
) -> list[dict[str, Any]]:
    all_posts = read_data("posts.json")
    query = q.casefold().strip() if q else None
    requested_tag = tag.casefold().strip() if tag else None

    filtered: list[dict[str, Any]] = []
    for post in all_posts:
        searchable = " ".join(
            [post["title"], post["excerpt"], " ".join(post["tags"])]
        ).casefold()
        if query and query not in searchable:
            continue
        if requested_tag and requested_tag not in {
            post_tag.casefold() for post_tag in post["tags"]
        }:
            continue
        filtered.append({key: value for key, value in post.items() if key != "content"})

    return sorted(filtered, key=lambda item: item["published_at"], reverse=True)


@app.post("/api/posts", status_code=status.HTTP_201_CREATED)
def create_post(
    payload: NewPostPayload, _: None = Depends(require_admin)
) -> dict[str, Any]:
    slug = post_slug(payload.title)
    clean_tags = list(dict.fromkeys(tag.strip() for tag in payload.tags if tag.strip()))
    if not clean_tags:
        raise HTTPException(status_code=422, detail="Add at least one topic tag.")
    if any(len(tag) > 40 for tag in clean_tags):
        raise HTTPException(status_code=422, detail="Topic tags must be 40 characters or fewer.")

    article = payload.model_dump(mode="json")
    article["slug"] = slug
    article["tags"] = clean_tags

    with POSTS_LOCK:
        current_posts = json.loads(POSTS_PATH.read_text(encoding="utf-8"))
        if any(post["slug"] == slug for post in current_posts):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A journal post with this title already exists.",
            )
        current_posts.append(article)
        temporary_path = POSTS_PATH.with_suffix(".json.tmp")
        temporary_path.write_text(
            json.dumps(current_posts, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        temporary_path.replace(POSTS_PATH)
        read_data.cache_clear()

    return article


@app.get("/api/posts/{slug}")
def post_by_slug(slug: str) -> dict[str, Any]:
    if not re.fullmatch(r"[a-z0-9-]+", slug):
        raise HTTPException(status_code=404, detail="Post not found")
    for post in read_data("posts.json"):
        if post["slug"] == slug:
            return post
    raise HTTPException(status_code=404, detail="Post not found")


@app.get("/api/resume")
def resume() -> FileResponse:
    if not RESUME_PATH.is_file():
        raise HTTPException(status_code=404, detail="Resume file not found")
    return FileResponse(
        RESUME_PATH,
        media_type="application/pdf",
        filename="Alexander-Herlan-Resume.pdf",
        content_disposition_type="inline",
    )


def deliver_contact_email(payload: ContactPayload) -> None:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("SMTP_FROM_EMAIL") or smtp_username
    to_email = os.getenv("CONTACT_TO_EMAIL", "alexwherlan@gmail.com")
    use_tls = os.getenv("SMTP_USE_TLS", "true").casefold() == "true"
    use_ssl = os.getenv("SMTP_USE_SSL", "false").casefold() == "true"

    if not smtp_host or not from_email:
        raise RuntimeError("SMTP delivery is not configured")

    message = EmailMessage()
    message["Subject"] = f"Portfolio inquiry: {payload.subject}"
    message["From"] = from_email
    message["To"] = to_email
    message["Reply-To"] = str(payload.email)
    message.set_content(
        f"New portfolio inquiry\n\n"
        f"From: {payload.name} <{payload.email}>\n"
        f"Subject: {payload.subject}\n\n"
        f"{payload.message}"
    )

    context = ssl.create_default_context()
    smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
    with smtp_class(smtp_host, smtp_port, timeout=20) as client:
        if use_tls and not use_ssl:
            client.starttls(context=context)
        if smtp_username and smtp_password:
            client.login(smtp_username, smtp_password)
        client.send_message(message)


@app.post("/api/contact", status_code=202)
async def contact(payload: ContactPayload) -> dict[str, str]:
    # A filled hidden field is almost certainly an automated submission. Respond
    # normally so bots do not learn how the trap works.
    if payload.company:
        return {"status": "accepted", "message": "Thanks — your note is on its way."}

    try:
        await run_in_threadpool(deliver_contact_email, payload)
    except (OSError, RuntimeError, smtplib.SMTPException) as exc:
        raise HTTPException(
            status_code=503,
            detail="Email delivery is temporarily unavailable. Please email Alex directly.",
        ) from exc

    return {"status": "accepted", "message": "Thanks — your note is on its way."}


if FRONTEND_DIST.is_dir():

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        requested_file = (FRONTEND_DIST / path).resolve()
        try:
            requested_file.relative_to(FRONTEND_DIST.resolve())
        except ValueError:
            raise HTTPException(status_code=404, detail="Not found")

        if requested_file.is_file():
            return FileResponse(requested_file)
        return FileResponse(FRONTEND_DIST / "index.html")
