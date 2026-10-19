# JuaScam

React/Vite frontend for the JuaScam public message scanner and Flask rule-based analysis API. Account sign-in and saved personal scan history are deferred.

See [backend/README.md](./backend/README.md) for API setup and tests, and [frontend/README.md](./frontend/README.md) for local frontend setup and verification.

## Deploy to Render

The root `render.yaml` and `Dockerfile` deploy the Flask API and built React app together as one Render web service. In Render, choose **New → Blueprint**, connect this GitHub repository, and create the `juascam` service. Render builds the frontend and backend into one container and deploys it with HTTPS. After deployment, open the service's `onrender.com` URL; `/api/health` should return `{"status":"ok","service":"JuaScam API"}`.

The free service may sleep while idle, and its local SQLite database is ephemeral. Anonymous aggregate statistics can reset when the service restarts or redeploys. Persistent database storage requires a separate production storage plan; no paid storage is configured by default.