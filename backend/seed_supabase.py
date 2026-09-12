from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client


BASE_DIR = Path(__file__).resolve().parent


def main() -> None:
    load_dotenv(BASE_DIR / ".env")
    url = os.getenv("SUPABASE_URL", "").strip()
    key = (
        os.getenv("SUPABASE_SECRET_KEY", "").strip()
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    )
    table = os.getenv("SUPABASE_ARTICLES_TABLE", "articles").strip()
    if not url or not key:
        raise SystemExit("Add SUPABASE_URL and SUPABASE_SECRET_KEY to backend/.env first.")

    posts = json.loads((BASE_DIR / "data" / "posts.json").read_text(encoding="utf-8"))
    response = create_client(url, key).table(table).upsert(posts, on_conflict="slug").execute()
    print(f"Seeded {len(response.data or [])} articles into {table}.")


if __name__ == "__main__":
    main()
