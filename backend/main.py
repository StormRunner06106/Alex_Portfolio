from __future__ import annotations

import json
import os
import re
import smtplib
import ssl
from email.message import EmailMessage
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field
from starlette.concurrency import run_in_threadpool


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIST = PROJECT_DIR / "frontend" / "dist"
RESUME_PATH = PROJECT_DIR / "Alexander Herlan Resume 2024.pdf"


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


@lru_cache(maxsize=8)
def read_data(filename: str) -> Any:
    path = DATA_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=500, detail=f"Missing data file: {filename}")
    return json.loads(path.read_text(encoding="utf-8"))


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

