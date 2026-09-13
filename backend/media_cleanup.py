"""Durable cleanup of explicitly removed journal media after article writes."""
import asyncio
from contextlib import asynccontextmanager, suppress
from functools import wraps
import json
import inspect
import re
from threading import RLock

from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

LOCK = RLock()
TABLE = "article_media_deletions"


def serialized(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        with LOCK:
            return function(*args, **kwargs)
    wrapped.__signature__ = inspect.signature(function, eval_str=True)
    return wrapped


def media_items(article):
    return [m for m in [article.get("banner"), *(article.get("attachments") or [])] if m]


def local_queue_path():
    from backend import main
    return main.DATA_DIR / "media-deletions.json"


def pending():
    from backend import main
    client = main.get_supabase()
    if client is not None:
        return main.read_article_query(client.table(TABLE).select("upload_id,metadata").order("created_at")).data
    path = local_queue_path()
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def save_local_queue(records):
    path = local_queue_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(records), encoding="utf-8")
    temporary.replace(path)


def enqueue(media):
    """Persist intent before changing the article; referenced files stay protected."""
    from backend import main
    if not media:
        return
    records = {}
    for item in media:
        upload_id = item["url"].rsplit("/", 1)[-1]
        stored = main.uploaded_media(upload_id)
        records[upload_id] = {"upload_id": upload_id, "metadata": stored}
    client = main.get_supabase()
    try:
        if client is not None:
            result = client.table(TABLE).upsert(list(records.values())).execute()
            if not result.data:
                raise RuntimeError("Removal queue was not saved")
        else:
            save_local_queue(list({**{r["upload_id"]: r for r in pending()}, **records}.values()))
    except Exception as exc:
        raise HTTPException(502, "The file removal could not be scheduled. Please save again.") from exc


def enqueue_urls(urls):
    from backend import main
    media = []
    for url in set(urls):
        if not re.fullmatch(r"/api/uploads/[a-f0-9]{32}", url):
            raise HTTPException(422, "Invalid file removal reference.")
        try:
            media.append(main.uploaded_media(url.rsplit("/", 1)[-1]))
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
    enqueue(media)


def forget(upload_id):
    from backend import main
    client = main.get_supabase()
    if client is not None:
        client.table(TABLE).delete().eq("upload_id", upload_id).execute()
    else:
        save_local_queue([r for r in pending() if r["upload_id"] != upload_id])


@serialized
def cleanup_pending():
    from backend import main, dropbox_storage
    try:
        records = pending()
        if not records:
            return
        referenced = [m for p in main.article_records(include_content=False) for m in media_items(p)]
        active_urls = {m["url"] for m in referenced}
        active_ids = {m.get("dropbox_file_id") for m in referenced if m.get("dropbox_file_id")}
        client = main.get_supabase()
        for record in records:
            upload_id, media = record["upload_id"], record["metadata"]
            if not re.fullmatch(r"[a-f0-9]{32}", upload_id):
                continue
            if media["url"] in active_urls or media.get("dropbox_file_id") in active_ids:
                continue
            try:
                if media.get("storage") == "dropbox":
                    dropbox_storage.delete(media["dropbox_file_id"])
                # Remove registry and migration backups only after Dropbox succeeds.
                if client is not None:
                    client.table("article_media").delete().eq("upload_id", upload_id).execute()
                for suffix in ("", ".json"):
                    path = main.UPLOAD_DIR / (upload_id + suffix)
                    if path.resolve().parent != main.UPLOAD_DIR.resolve():
                        raise ValueError("Invalid upload cleanup path")
                    path.unlink(missing_ok=True)
                forget(upload_id)
            except Exception as exc:
                main.logger.warning("Journal file cleanup pending: type=%s", type(exc).__name__)
    except Exception as exc:
        main.logger.warning("Journal cleanup retry pending: type=%s", type(exc).__name__)


@asynccontextmanager
async def lifespan(app):
    async def retry():
        while True:
            await run_in_threadpool(cleanup_pending)
            await asyncio.sleep(60)
    task = asyncio.create_task(retry())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
