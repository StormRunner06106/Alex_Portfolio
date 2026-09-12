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
uvicorn backend.main:app --reload --port 8000 --env-file backend\.env
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
uvicorn backend.main:app --reload --port 8000 --env-file backend\.env
```

If SMTP is unavailable, the API returns a clear delivery error and the page keeps Alex's direct email, LinkedIn, and GitHub links visible.

## Journal publisher

Open `http://localhost:5173/blog/manage` and sign in with the journal admin password. The writing room uses Tiptap for headings, bold and italic text, lists, undo/redo, and inline font sizes. Publishing writes to Supabase when it is configured, or to `backend/data/posts.json` during local fallback mode.

Set unique production values in `backend/.env`:

```dotenv
JOURNAL_ADMIN_PASSWORD=replace-with-a-strong-password
JOURNAL_TOKEN_SECRET=replace-with-a-long-random-secret
```

The login endpoint returns a signed session that expires after four hours. The password remains server-side and the browser stores only the temporary token.

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
