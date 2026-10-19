# JuaScam

JuaScam uses a React/Vite frontend and a Flask analysis API. The current app is public and does not require an account. Registration, sign-in, account settings, and per-user scan history are deferred until after the project is running.

The Flask service exposes `/api/analyze`, `/api/history`, `/api/stats`, and `/api/health`. SQLite stores daily aggregate counts only; it does not store message text, per-message scan results, or account IDs.

Supabase account support is intentionally not part of the current application flow. The migration and account components are retained for possible future re-enablement; no Supabase configuration is required to run or scan with the current app. The scanner does not save message contents.

## Run locally

Follow [the backend setup guide](../backend/README.md) to install Flask dependencies and start the API from the repository root.

In a second terminal, start the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Vite forwards `/api/*` requests to `http://127.0.0.1:5000`. In production, configure the web host or reverse proxy to route `/api/*` to Flask and the remaining app routes to the frontend. Do not expose Flask's development server directly to the public internet.

For production hosting, configure the host to serve `index.html` for the application route `/`.

## Verify

- **Public scan:** use the scanner signed out. Try an empty submission, a message containing terms such as “urgent” or “verify your account,” and a message with no recognized patterns. Results are preliminary indicators, not a definitive safe/scam decision.
- **Aggregate API:** analyze messages and request `/api/stats` and `/api/history`; totals should update while message text remains unstored.
- **Account routes:** `/login`, `/register`, `/dashboard`, and other account-only paths return to the public scanner while account features are deferred.

Build and lint:

```powershell
npm run lint
npm run build
```

Run the backend tests from the repository root:

```powershell
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend\tests
```

## Current limitations

- The Flask scanner is a rule-based demonstration. It does not call a threat-intelligence service, resolve shortened URLs, or verify a sender's identity. A low risk score or no recognized indicators does not mean a message is safe.
- The risk score is a capped sum of configured rule weights. The API labels scores below 20 low, 20–49 suspicious, and 50 or higher high risk; this is not a probability or model confidence.
- SQLite `/api/history` and `/api/stats` report anonymous daily aggregates. Per-user authentication and saved scan history are deferred.
- Configure production HTTPS, request rate limiting, and server-side monitoring before public deployment. The local Flask development server is not a production server.
