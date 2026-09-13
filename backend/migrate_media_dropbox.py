"""Migrate referenced local article media; originals are retained as backups."""
import argparse
import json

from dotenv import load_dotenv

from backend import main, dropbox_storage


def migrate(apply=False):
    records = main.article_records()
    media = {item["url"]: item for post in records for item in [post.get("banner"), *(post.get("attachments") or [])] if item}
    local = [item for item in media.values() if item.get("storage") != "dropbox"]
    print(f"{len(local)} local media references across {len(records)} articles.")
    if not apply:
        print("Preview only. Use --apply to upload files and update article metadata.")
        return
    dropbox_storage.get_dropbox()  # Fail before modifying anything if not configured.
    converted = {}
    for item in local:
        upload_id = item["url"].rsplit("/", 1)[-1]
        stored = main.uploaded_media(upload_id)
        if stored.get("storage") != "dropbox":
            data = (main.UPLOAD_DIR / upload_id).read_bytes()
            stored = {**stored, "storage": "dropbox", "dropbox_file_id": dropbox_storage.upload(data, upload_id, stored["name"])}
            main.save_media_metadata(upload_id, stored)
            # Keep old URLs working on this server too; retain the original bytes.
            (main.UPLOAD_DIR / f"{upload_id}.json").write_text(json.dumps(stored), encoding="utf-8")
        converted[item["url"]] = stored
    client = main.get_supabase()
    for post in records:
        banner = post.get("banner")
        attachments = post.get("attachments") or []
        replacement = {
            "banner": converted.get(banner["url"], banner) if banner else None,
            "attachments": [converted.get(item["url"], item) for item in attachments],
        }
        if replacement == {"banner": banner, "attachments": attachments}:
            continue
        if client is not None:
            result = client.table(main.articles_table()).update(replacement).eq("slug", post["slug"]).execute()
            if not result.data:
                raise RuntimeError("An article could not be updated. Retry the migration.")
        else:
            with main.POSTS_LOCK:
                latest = json.loads(main.POSTS_PATH.read_text(encoding="utf-8"))
                for current in latest:
                    if current["slug"] == post["slug"]:
                        current.update(replacement)
                main.save_local_posts(latest)
    print(f"Updated {len(converted)} media references. Original local files were retained.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    arguments = parser.parse_args()
    load_dotenv(main.BASE_DIR / ".env")
    migrate(arguments.apply)
