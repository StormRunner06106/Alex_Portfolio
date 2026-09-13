"""Confirmed, safely retryable writes for immutable upload-ID metadata."""
import logging
import re
import time

from httpx import TransportError
from supabase import PostgrestAPIError

logger = logging.getLogger("uvicorn.error")
TRANSIENT_CODES = {"500", "502", "503", "504", "520", "522", "524"}


class UnconfirmedMediaWrite(RuntimeError):
    pass


def matches(rows, records):
    saved = {row["upload_id"]: row["metadata"] for row in (rows or [])}
    return all(saved.get(record["upload_id"]) == record["metadata"] for record in records)


def upsert(client, table, records):
    """Retry only identical upserts by primary key, never article inserts/deletes.

    A timeout can arrive after commit. Read back the exact batch to confirm it,
    including servers/proxies that return no representation of a successful write.
    """
    for attempt in range(3):
        try:
            result = client.table(table).upsert(records, on_conflict="upload_id").retry(False).execute()
            if matches(result.data, records):
                return
            raise UnconfirmedMediaWrite("Media write returned incomplete confirmation")
        except Exception as exc:
            code = str(getattr(exc, "code", ""))
            transient = isinstance(exc, (TransportError, UnconfirmedMediaWrite)) or (
                isinstance(exc, PostgrestAPIError) and code in TRANSIENT_CODES
            )
            safe_code = code if re.fullmatch(r"[A-Za-z0-9_]{1,20}", code) else "unknown"
            logger.warning("Media registry write: table=%s type=%s code=%s attempt=%s", table, type(exc).__name__, safe_code, attempt + 1)
            if not transient:
                raise
            try:
                confirmed = client.table(table).select("upload_id,metadata").in_(
                    "upload_id", [record["upload_id"] for record in records],
                ).retry(False).execute()
                if matches(confirmed.data, records):
                    return
            except Exception:
                # Preserve the original write failure if neither operation works.
                pass
            if attempt == 2:
                raise
            time.sleep(0.25 * (attempt + 1))
