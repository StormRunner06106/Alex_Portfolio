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
scripts/generate_resume.py Single-file Markdown → HTML → PDF generator
resumes/                   Matching HTML/PDF files for each generated version
```

## Generate a resume

The standalone generator reads `Alexander Herlan Resume 2024.md`, creates a self-contained HTML document, and prints that exact HTML to PDF using Python Playwright. The template and CSS are in `scripts/generate_resume.py`. The default `--layout original` retains the sidebar design with left-column section labels, right-column content, Letter pages, and green header accents. Section starts use normal-flow grid layout to preserve the PDF text reading order. The current content occupies three pages in this layout. Use `--layout ats` for the optional single-column layout, which fits the current content into two pages. Both layouts use the same Markdown and local Raleway/Lato fonts when available, with Arial as a fallback. The original PDF is only a design reference, and is not needed to run the generator.

Install the generator dependencies separately from the web backend:

```powershell
.venv/Scripts/python.exe -m pip install Markdown==3.10.3 playwright==1.62.0
.venv/Scripts/python.exe -m playwright install chromium
.venv/Scripts/python.exe scripts/generate_resume.py
```

Each run creates the next unused pair, such as `resumes/resume-v1.html` and `resumes/resume-v1.pdf`, then `resume-v2.html` and `resume-v2.pdf`. Existing versions are never overwritten. To choose a version or Markdown source:

```powershell
.venv/Scripts/python.exe scripts/generate_resume.py --version 2026-09
.venv/Scripts/python.exe scripts/generate_resume.py "path/to/resume.md" --version v3
```

Use `--browser msedge` or `--browser chrome` to render with an already installed browser instead of installing Chromium. `--output-dir` changes the destination; by default, output goes to the repository's `resumes` directory regardless of your working directory. You can also run the script with `uv run`, using its embedded dependency metadata (a supported browser is still required).

Markdown format: start with one `# Name`, optionally follow with a bold professional title, then contact details. Use `##` for sections, `###` for roles/categories, and smaller headings for accomplishments/projects. Italic-only paragraphs become date/location lines. Lists, links, and tables are supported; the four-column References table is formatted as individual contact lines to match the original. All resume content is read from Markdown. Generation is local and does not publish the files or change the website's existing `/api/resume` download.

Package references: [Python-Markdown](https://python-markdown.github.io/reference/) and [Playwright PDF rendering](https://playwright.dev/python/docs/api/class-page#page-pdf).

For content updates, edit the Markdown first and rerun the generator to create a new matching HTML/PDF pair. Do not edit generated content directly. Each HTML file records the SHA-256 of its source text in a `source-sha256` meta tag, so its source revision can be checked. The generator rejects long dashes in visible Markdown text instead of silently rewriting them in the output. Earlier versions remain historical snapshots; regenerate after each Markdown edit to keep the latest pair current.

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

The media picker supports drag-and-drop or file browsing, a live banner preview with the article title and subtitle, file-size and format checks, and duplicate detection by file name and size. Uploads have individual progress, cancel, and retry controls; a failed file does not stop the remaining queue. Retry or remove pending/failed uploads before publishing. Drag an attachment row with a mouse, or briefly hold its grip handle on a touch screen, to change the order of additional photos and files. Keyboard users can focus the handle, press Space to pick up a file, use the arrow keys to move it, and press Space to drop or Escape to cancel. The new order is persisted when the article is saved. Build the frontend and run `.venv/Scripts/python.exe -m scripts.test_attachment_reordering` to verify mouse, touch, keyboard, cancellation, and order persistence in an isolated browser test (requires Playwright and Microsoft Edge). Replacing a banner keeps the previous image until the replacement uploads successfully.

The publisher accepts a banner image (JPEG, PNG, WebP, or GIF, up to 8 MB) and up to ten additional photos or files (20 MB each). The banner appears in the journal thumbnail and behind the article title and subtitle with a readability overlay; additional photos and downloadable files appear below the body. Uploads require an admin session. New uploads use Dropbox by default. The Supabase article's `banner` and each item in `attachments` contain `storage: "dropbox"` and `dropbox_file_id: "id:..."`, alongside their names, sizes, media types, and stable website URLs.

The `article_media` table stores the upload-ID-to-Dropbox-ID mapping, including uploads not yet attached to a published article. The public `/api/uploads/{upload_id}` route retrieves bytes from Dropbox by ID, so article rows never contain expiring temporary links or access tokens. Original local uploads continue to work until migrated. Saving an attachment removal or banner replacement deletes the unused file from Dropbox and removes its upload record and any local migration backup. Deleting an article also cleans up its uploaded files. Files referenced by another article are retained.

Removal intent is stored in the private `article_media_deletions` table before the article write. Upload metadata and removal-queue upserts retry temporary Supabase failures up to three times, using the same upload IDs; after a timeout or incomplete response, the server reads back the exact records to confirm whether the write already succeeded. Cleanup runs after a successful save/delete and retries pending work at backend startup and every 60 seconds; Dropbox outages do not lose deletion requests. Cleanup checks published references before deleting anything. In local mode, the queue lives in `backend/data/media-deletions.json`. The form tracks uploads removed before publishing as well; removals take effect when the form is successfully submitted. Apply the current schema to existing Supabase projects before running this version. Article writes and cleanup are serialized within the backend process; run a single backend worker for this workflow.

For an existing Supabase project, run `bash scripts/setup_supabase.sh --schema-only` to add the nullable `banner` and default-empty `attachments` columns before running the updated backend. Existing articles remain compatible.

Verify article publishing and uploads with `.venv/Scripts/python.exe -m unittest backend.test_articles`.

## Connect the owner's Dropbox account

This website uses its own server-side Dropbox API app, independently of journal admin sign-in or any chat connector. A personal Dropbox account is sufficient; it must authorize the website's developer app once.

1. In the [Dropbox App Console](https://www.dropbox.com/developers/apps), create a **Scoped access** app with **App folder** access. Enable `files.content.write` and `files.content.read` on its Permissions tab and click **Submit** to save. Keep this app's permissions limited to those needed for the website.
2. Set `DROPBOX_APP_KEY` and `DROPBOX_APP_SECRET` in `backend/.env` using the app's Settings tab. Keep these values server-side.
3. Run `.venv/Scripts/python.exe -m backend.connect_dropbox`. The helper opens the authorization URL in your browser (and prints it as a fallback). Approve access using the owner's personal account, and paste the returned code into the terminal. It uses the app's saved permissions and verifies that both required file scopes were granted before writing the refresh token directly into the ignored `backend/.env` file without printing it. Setup gives credentials in this file priority over shell variables.
4. Apply the media table with `bash scripts/setup_supabase.sh --schema-only`, if not already applied, then restart FastAPI with `--env-file backend/.env`.

If an old authorization link shows **No scope requested can be granted for this app**, rerun the updated helper and use its newly opened page. It no longer sends an explicit `scope` parameter. If setup reports missing permissions after approval, compare the App key printed by the helper with the app you edited in App Console; enable the listed permissions on that exact app, save with Submit, and rerun setup. Old links are not changed by editing the helper.

The SDK refreshes access tokens automatically using `DROPBOX_REFRESH_TOKEN`. See the [Dropbox OAuth guide](https://developers.dropbox.com/oauth-guide) for offline access. `DROPBOX_ACCESS_TOKEN` is supported for initial testing, but a short-lived token alone will eventually need replacing. New uploads fail clearly if Dropbox is not connected; they do not silently fall back to local storage.

To move existing published media to Dropbox, preview with `.venv/Scripts/python.exe -m backend.migrate_media_dropbox`, then run it with `--apply`. It uploads referenced files, updates the article rows, and preserves website image URLs and the original local files. Run the migration while article editing is paused. It can resume after a partial failure without re-uploading successfully recorded files.

For offline development only, set `JOURNAL_MEDIA_STORAGE=local`. Local files and legacy uploads use `JOURNAL_UPLOAD_DIR` (default `backend/data/uploads`). Dropbox uploads with Supabase configured do not require local file storage. If running without Supabase, upload metadata remains in that local directory and needs persistent storage.

## Edit experience and skills

Sign in with the existing admin password, then open **Experience** or **Skills** (also linked from the admin account menu). Experience supports adding, editing, and deleting roles, companies, locations, dates, summaries, highlights, technologies, and project links. Entries are displayed newest first by start date. Skills supports category CRUD, adding/removing individual skill labels, card colors, and editing the introduction and “How I work” principles. Press Enter in a label field to add it. Saves update the public website without code edits or Git pushes. Delete actions require confirmation; canceled dialogs leave published content unchanged.

Experience and skills live in the private Supabase `portfolio_content` table. Apply `backend/supabase/schema.sql` to existing projects, then run `.venv/Scripts/python.exe -m backend.seed_portfolio` once to copy the existing JSON content. Rerunning the seeder preserves content already saved in Supabase. All mutation endpoints require the same admin authentication as articles; reads remain public. Writes use version checks to avoid losing concurrent document updates. Configured Supabase failures are reported rather than falling back to outdated JSON. Local development without Supabase writes to the experience/skills JSON files.

Validation: `.venv/Scripts/python.exe -m unittest backend.test_portfolio_content`. After building the frontend, run `.venv/Scripts/python.exe -m scripts.test_portfolio_editors` for isolated browser coverage (requires Playwright and Microsoft Edge), including CRUD, public visibility, mobile forms, and keeping drafts through session recovery.

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
