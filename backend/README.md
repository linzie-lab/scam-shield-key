# JuaScam Flask API

This beginner-friendly Flask service checks messages and URLs with transparent rules. It does not use machine learning, contact external websites, or guarantee that content is safe or fraudulent.

## What is stored

SQLite stores daily totals grouped by risk category (`low`, `suspicious`, and `high`). It does not store message text, URLs, per-message scan results, or account identifiers. `/api/history` returns daily aggregate counts, not a person's scan history. Registered users' private history remains in Supabase and is still read directly by the existing React account pages.

## Set up on Windows

From the repository root, create and activate a virtual environment, then install the packages:

```powershell
py -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

Start the API from the repository root:

```powershell
python -m flask --app backend.app run --host 127.0.0.1 --port 5000
```

The API creates `backend/instance/juascam.sqlite3` automatically on first run. To choose another database path, set `JUASCAM_DATABASE_PATH` before starting Flask. To permit additional browser origins, set `JUASCAM_CORS_ORIGINS` to a comma-separated list of exact origins. By default, CORS allows `http://localhost:5173` and `http://127.0.0.1:5173`.

## API routes

- `GET /api/health` — reports whether the API is running.
- `POST /api/analyze` — accepts JSON such as `{"content":"Urgent: verify your account"}`. Content must be 1–5,000 characters.
- `GET /api/stats` — returns total scans and counts grouped by risk category.
- `GET /api/history?days=30` — returns daily aggregate counts for 1–90 days.

The risk score is a heuristic sum of rule weights capped at 100: 0–19 is `low`, 20–49 is `suspicious`, and 50–100 is `high`. The score is not a probability and does not prove content is safe or fraudulent. An `explanation` and `safety_advice` accompany each analysis.

## Run tests

From the repository root:

```powershell
python -m unittest discover -s backend\tests
```

Tests use a temporary SQLite database and do not change the development database.

## Start the frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Vite proxies `/api/*` to Flask at `http://127.0.0.1:5000`. The backend's development server is for local development only; use a production WSGI server, HTTPS, request limits, and appropriate deployment security before hosting publicly.
