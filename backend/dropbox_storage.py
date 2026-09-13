"""Server-only Dropbox access. Browser clients only receive media identifiers."""
import os
import re
from functools import lru_cache

import dropbox
from dropbox.exceptions import AuthError, DropboxException
from fastapi import HTTPException
from requests.exceptions import RequestException


@lru_cache(maxsize=1)
def get_dropbox():
    refresh = os.getenv("DROPBOX_REFRESH_TOKEN", "").strip()
    access = os.getenv("DROPBOX_ACCESS_TOKEN", "").strip()
    key = os.getenv("DROPBOX_APP_KEY", "").strip()
    secret = os.getenv("DROPBOX_APP_SECRET", "").strip()
    if not (refresh and key) and not access:
        raise HTTPException(503, "Dropbox uploads are not connected. Configure the server's Dropbox app credentials.")
    return dropbox.Dropbox(
        oauth2_refresh_token=refresh or None, oauth2_access_token=access or None,
        app_key=key or None, app_secret=secret or None,
        timeout=30, max_retries_on_error=0, max_retries_on_rate_limit=0,
    )


def upload(data: bytes, upload_id: str, name: str) -> str:
    # A UUID prevents clashes. With App Folder access this path is inside the app's folder.
    safe_name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name)[:120]
    try:
        result = get_dropbox().files_upload(
            data, f"/article-{upload_id}-{safe_name}",
            mode=dropbox.files.WriteMode.add, autorename=False, mute=True,
        )
        return result.id
    except AuthError as exc:
        # Never return 401 here: Dropbox authorization is separate from journal sign-in.
        raise HTTPException(503, "Dropbox needs to be reconnected by the site owner.") from exc
    except (DropboxException, RequestException) as exc:
        raise HTTPException(502, "Dropbox could not store this file. Please retry.") from exc


def download(file_id: str, limit: int) -> bytes:
    try:
        metadata, response = get_dropbox().files_download(file_id)
        try:
            if metadata.size > limit:
                raise HTTPException(502, "The stored file exceeds the upload limit.")
            data = bytearray()
            for chunk in response.iter_content(64 * 1024):
                data.extend(chunk)
                if len(data) > limit:
                    raise HTTPException(502, "The stored file exceeds the upload limit.")
            return bytes(data)
        finally:
            response.close()
    except AuthError as exc:
        raise HTTPException(503, "Dropbox needs to be reconnected by the site owner.") from exc
    except (DropboxException, RequestException) as exc:
        raise HTTPException(502, "This file is temporarily unavailable from Dropbox. Please retry.") from exc
