# Alex Herlan Portfolio

A custom React and FastAPI portfolio built from Alex Herlan's résumé. The interface uses hand-written CSS—no Tailwind or component library—and all profile, career, skills, and journal content is loaded from JSON through the API.

## Project structure

```text
backend/
  data/                  JSON content store
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
uvicorn backend.main:app --reload --port 8000
```

In a second terminal, start React:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to FastAPI on port 8000.

## Contact-form delivery

The form uses `POST /api/contact` and sends email through SMTP. Copy `backend/.env.example` to `backend/.env`, fill in the SMTP values, and start the API with the environment file:

```powershell
uvicorn backend.main:app --reload --port 8000 --env-file backend\.env
```

If SMTP is unavailable, the API returns a clear delivery error and the page keeps Alex's direct email, LinkedIn, and GitHub links visible.

## Content API

- `GET /api/profile`
- `GET /api/experience`
- `GET /api/skills`
- `GET /api/posts`
- `GET /api/posts/{slug}`
- `GET /api/resume`
- `POST /api/contact`

Edit the files in `backend/data` to update portfolio content. No database is required.

## Production build

```powershell
cd frontend
npm run build
cd ..
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

When `frontend/dist` exists, FastAPI serves the built single-page application and supports direct links such as `/experience` and `/blog/{slug}`.

