"""One-time seed: python -m backend.seed_portfolio. Existing content is preserved."""
import json
from dotenv import load_dotenv
from backend import main, portfolio_content


def seed():
    client = main.get_supabase()
    if client is None:
        raise SystemExit("Configure Supabase before seeding portfolio content.")
    for key in ("experience", "skills"):
        payload = json.loads((main.DATA_DIR / f"{key}.json").read_text(encoding="utf-8"))
        if key == "skills":
            for index, category in enumerate(payload["categories"]):
                category.setdefault("id", f"category-{index + 1}")
        # ON CONFLICT DO NOTHING makes rerunning setup safe for admin edits.
        client.table(portfolio_content.TABLE).upsert(
            {"key": key, "payload": payload, "version": 1}, on_conflict="key", ignore_duplicates=True,
        ).execute()
        print(f"{key}: initialized if missing; existing edits preserved.")


if __name__ == "__main__":
    load_dotenv(main.BASE_DIR / ".env")
    seed()
