# Alex Herlan Portfolio

A custom React and FastAPI portfolio built from Alex Herlan's résumé. The interface uses hand-written CSS—no Tailwind or component library. Profile, career, and skill content comes from JSON; journal articles use Supabase through FastAPI with a local JSON fallback.

## Project structure

```text
backend/
  data/                  Local content and article fallback
  supabase/schema.sql     Supabase articles table and security setup
  seed_supabase.py        One-time migration for the ten starter articles
  main.py                FastAPI routes, SMTP delivery, and production serving
  requirements.txt
frontend/
  public/                Alex's locally stored profile image
  src/                   React pages, components, and custom CSS
Alexander Herlan Resume 2024.pdf
Alexander Herlan Resume 2024.md
```

## Run locally

Create and install the Python environment from the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

Start FastAPI:

```powershell
uvicorn backend.main:app --reload --reload-dir backend --port 8000 --env-file backend\.env
```

In a second terminal, start React:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to FastAPI on port 8000.

The interface loads Roboto Flex from Google Fonts for its compact UI copy, while editorial headings keep the résumé-inspired serif treatment.

## Contact-form delivery

The form uses `POST /api/contact` and sends email through SMTP. Copy `backend/.env.example` to `backend/.env`, fill in the SMTP values, and start the API with the environment file:

```powershell
uvicorn backend.main:app --reload --reload-dir backend --port 8000 --env-file backend\.env
```

If SMTP is unavailable, the API returns a clear delivery error and the page keeps Alex's direct email, LinkedIn, and GitHub links visible.

## Journal publisher

Click the lock icon beside the header navigation and enter the journal admin password. Signing in enables **New article**, **Edit**, and **Delete** controls throughout the journal. The account icon opens the admin menu and sign-out control. You can also open `http://localhost:5173/blog/manage` directly; the page prompts you to sign in before writing.

The writing room uses Tiptap for headings, bold and italic text, lists, undo/redo, and inline font sizes. Creating, updating, and deleting articles uses Supabase when configured, or `backend/data/posts.json` in local fallback mode. Edit controls open `/blog/{slug}/edit` with the existing sections, formatting, topics, banner, and attachments. Editing a title preserves the published URL. Deleting an article requires confirmation and removes it from the journal; stored uploads remain available at their existing URLs.

Set unique production values in `backend/.env`:

```dotenv
JOURNAL_ADMIN_PASSWORD=replace-with-a-strong-password
JOURNAL_TOKEN_SECRET=replace-with-a-long-random-secret
```

The login endpoint returns a signed admin session that expires after four hours. The password remains server-side and the browser stores only the temporary token. The shared session restores after refresh and expires automatically. Every create, update, delete, and upload endpoint verifies the admin token on the server.

Reading the journal is public and independent of the admin session. Journal lists and article pages retry temporary failures once, refresh after successful sign-in, and offer **Try again** if the store remains unavailable. Existing content stays visible during failed refreshes. A temporary session-check failure preserves the saved token and can recover when the connection returns. Supabase reads use bounded retries and log the failure type/code without credentials or article content.

Use **+ Section** in the editor to add a section heading and opening paragraph. Section headings receive the same divider and uppercase drop cap as the starter articles, with formatting visible in the editor. Existing H2 headings use this styling automatically.

The media picker supports drag-and-drop or file browsing, a live banner preview with the article title and subtitle, file-size and format checks, and duplicate detection by file name and size. Uploads have individual progress, cancel, and retry controls; a failed file does not stop the remaining queue. Retry or remove pending/failed uploads before publishing. Use the up/down controls to set the order of additional photos and files. Replacing a banner keeps the previous image until the replacement uploads successfully.

The publisher accepts a banner image (JPEG, PNG, WebP, or GIF, up to 8 MB) and up to ten additional photos or files (20 MB each). The banner appears in the journal thumbnail and behind the article title and subtitle with a readability overlay; additional photos and downloadable files appear below the body. Uploads require an admin session. File contents are saved in `backend/data/uploads` in both article storage modes; set `JOURNAL_UPLOAD_DIR` to a persistent mounted directory in production and include it in backups. Uploaded files are publicly accessible by their generated URLs. Removing a selection from an unpublished draft does not delete its stored upload.

For an existing Supabase project, run `bash scripts/setup_supabase.sh --schema-only` to add the nullable `banner` and default-empty `attachments` columns before running the updated backend. Existing articles remain compatible.

Verify article publishing and uploads with `.venv/Scripts/python.exe -m unittest backend.test_articles`.

## Supabase article storage

The runtime backend needs two values from **Supabase Dashboard → Settings → API Keys**:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_replace_me
SUPABASE_ARTICLES_TABLE=articles
```

Use the new `sb_secret_...` key when available. It bypasses Row Level Security and must stay only in `backend/.env`; never add it to React or commit it. The older `service_role` key is accepted as a compatibility fallback through `SUPABASE_SERVICE_ROLE_KEY`.

To connect a project without creating anything manually in the Supabase console:

1. Add the URL, secret key, project ref, and scoped access token to `backend/.env`.
2. Run `bash scripts/setup_supabase.sh` from the repository root.
3. Restart FastAPI.

The Bash command applies `backend/supabase/schema.sql` through the Management API and imports all ten starter articles. Use `bash scripts/setup_supabase.sh --schema-only` when you want the table without seed data.

The access token must be project-scoped with **Database: Read-write** permission. Supabase recommends scoped access tokens for agents and automation because their reach can be limited to one project. Do not paste database passwords, access tokens, or secret keys into chat.

## Content API

- `GET /api/profile`
- `GET /api/experience`
- `GET /api/skills`
- `GET /api/posts`
- `GET /api/posts/{slug}`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/posts` (authenticated)
- `PUT /api/posts/{slug}` (authenticated)
- `DELETE /api/posts/{slug}` (authenticated)
- `POST /api/uploads` (authenticated)
- `GET /api/uploads/{upload_id}`
- `GET /api/resume`
- `POST /api/contact`

Edit the files in `backend/data` to update profile, career, and skill content. The health endpoint reports `articles: supabase` when the remote journal store is connected and `articles: json-fallback` otherwise.

## Production build

```powershell
cd frontend
npm run build
cd ..
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

When `frontend/dist` exists, FastAPI serves the built single-page application and supports direct links such as `/experience` and `/blog/{slug}`.
