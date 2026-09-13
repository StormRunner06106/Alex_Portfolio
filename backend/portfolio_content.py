"""Editable experience and skills, backed by Supabase with local development storage."""
import json
from threading import RLock
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StringConstraints, model_validator

LOCK = RLock()
TABLE = "portfolio_content"
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
Month = Annotated[str, StringConstraints(pattern=r"^[1-9][0-9]{3}-(0[1-9]|1[0-2])$")]


class ContentModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class Project(ContentModel):
    name: ShortText
    period: str = Field(default="", max_length=100)
    href: HttpUrl


class ExperienceInput(ContentModel):
    company: ShortText
    role: str = Field(min_length=1, max_length=200)
    location: str = Field(min_length=1, max_length=200)
    start: Month
    end: Month | None = None
    summary: str = Field(min_length=1, max_length=4000)
    highlights: list[LongText] = Field(default_factory=list, max_length=30)
    technologies: list[ShortText] = Field(default_factory=list, max_length=60)
    projects: list[Project] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.end and self.end < self.start:
            raise ValueError("End date must be on or after the start date.")
        return self


class CategoryInput(ContentModel):
    name: ShortText
    description: str = Field(min_length=1, max_length=1000)
    accent: Literal["blue", "lavender", "peach", "yellow", "mint"] = "mint"
    items: list[ShortText] = Field(default_factory=list, max_length=100)


class SkillsOverview(ContentModel):
    intro: str = Field(min_length=1, max_length=2000)
    principles: list[LongText] = Field(default_factory=list, max_length=20)


def load_document(key):
    from backend import main
    client = main.get_supabase()
    if client is None:
        # Read the file on each edit; don't mutate objects held in the public cache.
        path = main.DATA_DIR / f"{key}.json"
        return {"payload": json.loads(path.read_text(encoding="utf-8")), "version": 0}
    response = main.read_article_query(client.table(TABLE).select("payload,version").eq("key", key).limit(1))
    if not response.data:
        raise HTTPException(503, "Portfolio content has not been initialized on the server.")
    return response.data[0]


def save_document(key, payload, version):
    from backend import main
    client = main.get_supabase()
    if client is None:
        path = main.DATA_DIR / f"{key}.json"
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)
        main.read_data.cache_clear()
        return
    try:
        response = client.table(TABLE).update({"payload": payload, "version": version + 1}).eq("key", key).eq("version", version).execute()
    except Exception as exc:
        raise HTTPException(502, "Your changes could not be saved. Please try again.") from exc
    if not response.data:
        raise HTTPException(409, "This content changed while saving. Please try saving again.")


def experience():
    return sorted(load_document("experience")["payload"], key=lambda item: item["start"], reverse=True)


def skills():
    content = load_document("skills")["payload"]
    # Stable fallback IDs support existing local JSON before running the seeder.
    for index, category in enumerate(content["categories"]):
        category.setdefault("id", f"category-{index + 1}")
    return content


def mutate_item(key, collection, item_id=None, payload=None):
    with LOCK:
        document = load_document(key)
        content = document["payload"]
        items = content if collection is None else content[collection]
        if collection:
            for index, item in enumerate(items):
                item.setdefault("id", f"category-{index + 1}")
        if item_id is None:
            record = {**payload, "id": uuid4().hex}
            items.append(record)
        else:
            index = next((i for i, item in enumerate(items) if item["id"] == item_id), None)
            if index is None:
                raise HTTPException(404, "This entry no longer exists.")
            if payload is None:
                items.pop(index)
                record = {"deleted": True}
            else:
                record = {**payload, "id": item_id}
                items[index] = record
        save_document(key, content, document["version"])
        return record


def register_routes(app, require_admin):
    @app.get("/api/experience")
    def get_experience():
        return experience()

    @app.post("/api/experience", status_code=201)
    def create_experience(payload: ExperienceInput, _: None = Depends(require_admin)):
        return mutate_item("experience", None, payload=payload.model_dump(mode="json"))

    @app.put("/api/experience/{item_id}")
    def update_experience(item_id: str, payload: ExperienceInput, _: None = Depends(require_admin)):
        return mutate_item("experience", None, item_id, payload.model_dump(mode="json"))

    @app.delete("/api/experience/{item_id}")
    def delete_experience(item_id: str, _: None = Depends(require_admin)):
        return mutate_item("experience", None, item_id)

    @app.get("/api/skills")
    def get_skills():
        return skills()

    @app.patch("/api/skills")
    def update_overview(payload: SkillsOverview, _: None = Depends(require_admin)):
        with LOCK:
            document = load_document("skills")
            content = document["payload"]
            content.update(payload.model_dump(mode="json"))
            save_document("skills", content, document["version"])
            return content

    @app.post("/api/skills/categories", status_code=201)
    def create_category(payload: CategoryInput, _: None = Depends(require_admin)):
        return mutate_item("skills", "categories", payload=payload.model_dump(mode="json"))

    @app.put("/api/skills/categories/{item_id}")
    def update_category(item_id: str, payload: CategoryInput, _: None = Depends(require_admin)):
        return mutate_item("skills", "categories", item_id, payload.model_dump(mode="json"))

    @app.delete("/api/skills/categories/{item_id}")
    def delete_category(item_id: str, _: None = Depends(require_admin)):
        return mutate_item("skills", "categories", item_id)
