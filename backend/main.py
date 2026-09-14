from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import smtplib
import ssl
import threading
import time
import io
from uuid import uuid4
from urllib.parse import quote
from datetime import date
from email.message import EmailMessage
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from PIL import Image, UnidentifiedImageError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response
from pydantic import BaseModel, EmailStr, Field
from starlette.concurrency import run_in_threadpool
from httpx import TransportError
from supabase import Client, ClientOptions, PostgrestAPIError, create_client
from backend import dropbox_storage, media_cleanup, media_registry, portfolio_content


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIST = PROJECT_DIR / "frontend" / "dist"
# Pin the website to the selected resume; generating a draft must not publish it.
RESUME_PATH = PROJECT_DIR / "resumes" / "resume-v11.pdf"
POSTS_PATH = DATA_DIR / "posts.json"
POSTS_LOCK = threading.Lock()
ADMIN_TOKEN_TTL = 60 * 60 * 4
UPLOAD_DIR = Path(os.getenv("JOURNAL_UPLOAD_DIR", str(DATA_DIR / "uploads"))).resolve()
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
logger = logging.getLogger("uvicorn.error")


def on_vercel() -> bool:
    return os.getenv("VERCEL") == "1"


class ArticleMedia(BaseModel):
    url: str = Field(pattern=r"^/api/uploads/[a-f0-9]{32}$")
    name: str = Field(min_length=1, max_length=200)
    media_type: str = Field(max_length=100)
    size: int = Field(gt=0, le=MAX_UPLOAD_BYTES)
    storage: Literal["dropbox"] | None = None
    dropbox_file_id: str | None = Field(default=None, pattern=r"^id:[A-Za-z0-9_-]+$", max_length=200)


app = FastAPI(
    title="Alex Herlan Portfolio API",
    description="Supabase-ready content and contact delivery for Alex Herlan's portfolio.",
    version="1.1.0",
    lifespan=media_cleanup.lifespan,
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
    allow_methods=["GET", "POST", "PUT", "DELETE"],
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


class NewPostPayload(BaseModel):
    title: str = Field(min_length=5, max_length=160)
    excerpt: str = Field(min_length=20, max_length=360)
    published_at: date
    read_time: int = Field(ge=1, le=60)
    tags: list[str] = Field(min_length=1, max_length=6)
    accent: Literal["blue", "lavender", "peach", "yellow", "mint"] = "mint"
    content: dict[str, Any]
    banner: ArticleMedia | None = None
    attachments: list[ArticleMedia] = Field(default_factory=list, max_length=10)
    discarded_uploads: list[str] = Field(default_factory=list, max_length=100, exclude=True)


@lru_cache(maxsize=8)
def read_data(filename: str) -> Any:
    path = DATA_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=500, detail=f"Missing data file: {filename}")
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def get_supabase() -> Client | None:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = (
        os.getenv("SUPABASE_SECRET_KEY", "").strip()
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    )
    if not url and not key:
        return None
    if not url or not key:
        raise HTTPException(
            status_code=500,
            detail="Supabase configuration is incomplete.",
        )
    return create_client(url, key, options=ClientOptions(
        postgrest_client_timeout=8,
        auto_refresh_token=False,
        persist_session=False,
    ))


def articles_table() -> str:
    table = os.getenv("SUPABASE_ARTICLES_TABLE", "articles").strip()
    if not re.fullmatch(r"[a-z][a-z0-9_]*", table):
        raise HTTPException(status_code=500, detail="Invalid Supabase table name.")
    return table


def read_article_query(query: Any) -> Any:
    # Bound reads to two attempts, including SDK retries. Never retry mutations.
    for attempt in range(2):
        try:
            return query.retry(False).execute()
        except Exception as exc:
            code = str(getattr(exc, "code", ""))
            transient = isinstance(exc, TransportError) or (
                isinstance(exc, PostgrestAPIError) and code in {"500", "502", "503", "504", "520", "522", "524"}
            )
            # Log the error type and code, not credentials, article data, or response bodies.
            safe_code = code if re.fullmatch(r"[A-Za-z0-9_]{1,20}", code) else "unknown"
            logger.warning("Journal read failed: type=%s code=%s attempt=%s", type(exc).__name__, safe_code, attempt + 1)
            if transient and attempt == 0:
                time.sleep(0.2)
                continue
            raise HTTPException(status_code=502, detail="The journal store is temporarily unavailable. Please try again.") from exc


def article_records(include_content: bool = True) -> list[dict[str, Any]]:
    client = get_supabase()
    if client is None:
        records = read_data("posts.json")
        if include_content:
            return records
        return [
            {key: value for key, value in post.items() if key != "content"}
            for post in records
        ]

    columns = "slug,title,excerpt,published_at,read_time,tags,accent,banner,attachments"
    if include_content:
        columns += ",content"
    response = read_article_query(
        client.table(articles_table()).select(columns).order("published_at", desc=True)
    )
    return response.data or []


def tiptap_plain_text(document: dict[str, Any]) -> str:
    fragments: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            text = node.get("text")
            if isinstance(text, str):
                fragments.append(text)
            for child in node.get("content", []):
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(document)
    return " ".join(fragments).strip()


def journal_credentials() -> tuple[str, str]:
    if on_vercel() and get_supabase() is None:
        raise HTTPException(503, "Configure Supabase before publishing on Vercel.")
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
    return {
        "status": "ok",
        "articles": "supabase" if get_supabase() is not None else "json-fallback",
    }


@app.get("/api/cron/media-cleanup", include_in_schema=False)
def scheduled_media_cleanup(authorization: str | None = Header(default=None)):
    secret = os.getenv("CRON_SECRET", "")
    if not secret or not hmac.compare_digest(authorization or "", f"Bearer {secret}"):
        raise HTTPException(401, "Unauthorized")
    media_cleanup.cleanup_pending()
    return {"status": "completed"}


@app.get("/api/profile")
def profile() -> dict[str, Any]:
    return read_data("profile.json")


portfolio_content.register_routes(app, require_admin)


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
        "role": "admin",
    }


@app.get("/api/auth/session")
def admin_session(_: None = Depends(require_admin)) -> dict[str, Any]:
    return {"authenticated": True, "role": "admin"}


@app.get("/api/posts")
def posts(
    q: str | None = Query(default=None, max_length=100),
    tag: str | None = Query(default=None, max_length=50),
) -> list[dict[str, Any]]:
    all_posts = article_records(include_content=False)
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


def uploaded_media(upload_id: str) -> dict[str, Any]:
    if not re.fullmatch(r"[a-f0-9]{32}", upload_id):
        raise HTTPException(status_code=404, detail="File not found.")
    metadata = UPLOAD_DIR / f"{upload_id}.json"
    if metadata.is_file():
        local = json.loads(metadata.read_text(encoding="utf-8"))
        if local.get("storage") == "dropbox" or (UPLOAD_DIR / upload_id).is_file():
            return local
    client = get_supabase()
    if client is not None:
        result = read_article_query(client.table("article_media").select("metadata").eq("upload_id", upload_id).limit(1))
        if result.data:
            return result.data[0]["metadata"]
    raise HTTPException(status_code=404, detail="File not found.")


def save_media_metadata(upload_id: str, metadata: dict[str, Any]) -> None:
    client = get_supabase()
    if client is not None:
        try:
            media_registry.upsert(client, "article_media", [{"upload_id": upload_id, "metadata": metadata}])
        except Exception as exc:
            raise HTTPException(502, "The file uploaded, but its record could not be saved. Please retry.") from exc
    else:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (UPLOAD_DIR / f"{upload_id}.json").write_text(json.dumps(metadata), encoding="utf-8")


def store_upload(data: bytes, upload_id: str, metadata: dict[str, Any]) -> dict[str, Any]:
    storage = os.getenv("JOURNAL_MEDIA_STORAGE", "dropbox").strip().lower()
    if on_vercel() and (storage != "dropbox" or get_supabase() is None):
        raise HTTPException(503, "Vercel uploads require Dropbox and Supabase storage.")
    if storage == "dropbox":
        metadata = {**metadata, "storage": "dropbox", "dropbox_file_id": dropbox_storage.upload(data, upload_id, metadata["name"])}
        save_media_metadata(upload_id, metadata)
    elif storage == "local":
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (UPLOAD_DIR / upload_id).write_bytes(data)
        (UPLOAD_DIR / f"{upload_id}.json").write_text(json.dumps(metadata), encoding="utf-8")
    else:
        raise HTTPException(500, "Invalid journal media storage setting.")
    return metadata


@app.post("/api/uploads", status_code=201)
async def upload_media(
    request: Request,
    name: str = Query(min_length=1, max_length=200),
    purpose: Literal["banner", "attachment"] = "attachment",
    _: None = Depends(require_admin),
) -> dict[str, Any]:
    limit = 8 * 1024 * 1024 if purpose == "banner" else MAX_UPLOAD_BYTES
    if on_vercel():
        limit = min(limit, 4 * 1024 * 1024)
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > limit:
            raise HTTPException(status_code=413, detail=f"Choose a file smaller than {limit // (1024 * 1024)} MB.")
    if not data:
        raise HTTPException(status_code=422, detail="The selected file is empty.")
    media_type = "application/octet-stream"
    try:
        with Image.open(io.BytesIO(data)) as photo:
            photo.verify()
            media_type = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}.get(photo.format, media_type)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        pass
    if purpose == "banner" and not media_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="Choose a valid JPEG, PNG, WebP, or GIF banner.")
    upload_id = uuid4().hex
    metadata = {"url": f"/api/uploads/{upload_id}", "name": name.replace("\\", "/").split("/")[-1] or "attachment", "media_type": media_type, "size": len(data)}
    return await run_in_threadpool(store_upload, bytes(data), upload_id, metadata)


@app.get("/api/uploads/{upload_id}", response_model=None)
def download_media(upload_id: str):
    media = uploaded_media(upload_id)
    if media.get("storage") == "dropbox":
        if on_vercel() and media["size"] > 4 * 1024 * 1024:
            return RedirectResponse(dropbox_storage.temporary_link(media["dropbox_file_id"]),
                                    status_code=307, headers={"Cache-Control": "no-store"})
        data = dropbox_storage.download(media["dropbox_file_id"], MAX_UPLOAD_BYTES)
        disposition = "inline" if media["media_type"].startswith("image/") else "attachment"
        return Response(data, media_type=media["media_type"], headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(media['name'], safe='')}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=3600",
        })
    return FileResponse(
        UPLOAD_DIR / upload_id,
        media_type=media["media_type"],
        filename=media["name"],
        content_disposition_type="inline" if media["media_type"].startswith("image/") else "attachment",
        headers={"X-Content-Type-Options": "nosniff"},
    )


def validated_article(payload: NewPostPayload, slug: str) -> dict[str, Any]:
    clean_tags = list(dict.fromkeys(tag.strip() for tag in payload.tags if tag.strip()))
    if not clean_tags:
        raise HTTPException(status_code=422, detail="Add at least one topic tag.")
    if any(len(tag) > 40 for tag in clean_tags):
        raise HTTPException(status_code=422, detail="Topic tags must be 40 characters or fewer.")

    article = payload.model_dump(mode="json")
    article["slug"] = slug
    article["tags"] = clean_tags
    def canonical_media(media):
        if media is None:
            return None
        stored = uploaded_media(media["url"].rsplit("/", 1)[-1])
        canonical = ArticleMedia.model_validate(stored).model_dump()
        # An editor can remain open while its local files are migrated to Dropbox.
        # The upload URL and file details are unchanged; resolve the new storage
        # fields from the server without trusting a client-supplied Dropbox ID.
        if (media["storage"] is None and media["dropbox_file_id"] is None
                and canonical["storage"] == "dropbox" and canonical["dropbox_file_id"]):
            media = {**media, "storage": canonical["storage"],
                     "dropbox_file_id": canonical["dropbox_file_id"]}
        if canonical != media:
            raise HTTPException(status_code=422, detail="An attachment is invalid. Please upload it again.")
        return stored
    article["banner"] = canonical_media(article["banner"])
    article["attachments"] = [canonical_media(media) for media in article["attachments"]]
    if article["banner"] and not article["banner"]["media_type"].startswith("image/"):
        raise HTTPException(status_code=422, detail="The banner must be an image.")

    if article["content"].get("type") != "doc" or len(tiptap_plain_text(article["content"])) < 40:
        raise HTTPException(status_code=422, detail="The article body is too short.")
    if len(json.dumps(article["content"], ensure_ascii=False)) > 250_000:
        raise HTTPException(status_code=422, detail="The formatted article is too large.")
    return article


def save_local_posts(records: list[dict[str, Any]]) -> None:
    # Call while holding POSTS_LOCK so readers only see a complete replacement.
    temporary_path = POSTS_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(
        json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    temporary_path.replace(POSTS_PATH)
    read_data.cache_clear()


@app.post("/api/posts", status_code=status.HTTP_201_CREATED)
@media_cleanup.serialized
def create_post(
    payload: NewPostPayload, _: None = Depends(require_admin)
) -> dict[str, Any]:
    slug = post_slug(payload.title)
    article = validated_article(payload, slug)
    media_cleanup.enqueue_urls(payload.discarded_uploads)

    client = get_supabase()
    if client is not None:
        try:
            existing = (
                client.table(articles_table())
                .select("slug")
                .eq("slug", slug)
                .limit(1)
                .execute()
            )
            if existing.data:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A journal post with this title already exists.",
                )
            created = client.table(articles_table()).insert(article).execute()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The article could not be saved to Supabase.",
            ) from exc
        if not created.data:
            raise HTTPException(status_code=502, detail="Supabase did not return the new article.")
        media_cleanup.cleanup_pending()
        return created.data[0]

    with POSTS_LOCK:
        current_posts = json.loads(POSTS_PATH.read_text(encoding="utf-8"))
        if any(post["slug"] == slug for post in current_posts):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A journal post with this title already exists.",
            )
        current_posts.append(article)
        save_local_posts(current_posts)

    media_cleanup.cleanup_pending()
    return article


@app.put("/api/posts/{slug}")
@media_cleanup.serialized
def update_post(
    slug: str, payload: NewPostPayload, _: None = Depends(require_admin)
) -> dict[str, Any]:
    if not re.fullmatch(r"[a-z0-9-]+", slug):
        raise HTTPException(status_code=404, detail="Post not found")
    # Keep published URLs stable when an admin changes the title.
    article = validated_article(payload, slug)
    previous = post_by_slug(slug)
    media_cleanup.enqueue_urls(payload.discarded_uploads)
    retained = {m["url"] for m in media_cleanup.media_items(article)}
    media_cleanup.enqueue([m for m in media_cleanup.media_items(previous) if m["url"] not in retained])
    client = get_supabase()
    if client is not None:
        try:
            response = client.table(articles_table()).update(article).eq("slug", slug).execute()
        except Exception as exc:
            raise HTTPException(status_code=502, detail="The article could not be updated. Please try again.") from exc
        if not response.data:
            raise HTTPException(status_code=404, detail="Post not found")
        media_cleanup.cleanup_pending()
        return response.data[0]

    with POSTS_LOCK:
        records = json.loads(POSTS_PATH.read_text(encoding="utf-8"))
        for index, existing in enumerate(records):
            if existing["slug"] == slug:
                records[index] = {**existing, **article}
                save_local_posts(records)
                saved = records[index]
                break
        else:
            raise HTTPException(status_code=404, detail="Post not found")
    media_cleanup.cleanup_pending()
    return saved


@app.delete("/api/posts/{slug}")
@media_cleanup.serialized
def delete_post(slug: str, _: None = Depends(require_admin)) -> dict[str, bool]:
    if not re.fullmatch(r"[a-z0-9-]+", slug):
        raise HTTPException(status_code=404, detail="Post not found")
    previous = post_by_slug(slug)
    media_cleanup.enqueue(media_cleanup.media_items(previous))
    client = get_supabase()
    if client is not None:
        try:
            response = client.table(articles_table()).delete().eq("slug", slug).execute()
        except Exception as exc:
            raise HTTPException(status_code=502, detail="The article could not be deleted. Please try again.") from exc
        if not response.data:
            raise HTTPException(status_code=404, detail="Post not found")
        media_cleanup.cleanup_pending()
        return {"deleted": True}

    with POSTS_LOCK:
        records = json.loads(POSTS_PATH.read_text(encoding="utf-8"))
        remaining = [post for post in records if post["slug"] != slug]
        if len(remaining) == len(records):
            raise HTTPException(status_code=404, detail="Post not found")
        save_local_posts(remaining)
    media_cleanup.cleanup_pending()
    return {"deleted": True}


@app.get("/api/posts/{slug}")
def post_by_slug(slug: str) -> dict[str, Any]:
    if not re.fullmatch(r"[a-z0-9-]+", slug):
        raise HTTPException(status_code=404, detail="Post not found")

    client = get_supabase()
    if client is not None:
        response = read_article_query(
            client.table(articles_table())
            .select("slug,title,excerpt,published_at,read_time,tags,accent,content,banner,attachments")
            .eq("slug", slug).limit(1)
        )
        if response.data:
            return response.data[0]
        raise HTTPException(status_code=404, detail="Post not found")

    for post in article_records():
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
        filename="Alexander-Herlan-Resume-v11.pdf",
        content_disposition_type="inline",
    )


def deliver_contact_email(payload: ContactPayload) -> None:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("SMTP_FROM_EMAIL") or smtp_username
    to_email = os.getenv("CONTACT_TO_EMAIL", "alex@herlan.dev")
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


if FRONTEND_DIST.is_dir() and not on_vercel():

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
