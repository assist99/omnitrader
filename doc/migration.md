# Migration: Move Next.js API routes to Engine

This repository was refactored so that the `engine` service is the single backend API and the `ui` is a pure frontend. The UI no longer reads or writes the database directly.

Key points
- The engine exposes a REST API under `/api/*` (see `doc/engine-api.md`).
- The UI uses the environment variable `NEXT_PUBLIC_ENGINE_URL` and the `engineFetch` helper to call the engine API from client code.
- Authentication is JWT-based. Tokens are returned to the UI and stored in `sessionStorage` (sent in `Authorization: Bearer <token>`).
- The engine handles encryption of sensitive fields (API keys) using AES-256-CBC.
- Telegram integration and other services live in the engine; the UI calls endpoints to update Telegram settings and send test messages.

Developer notes
- To run the engine locally:

```powershell
cd src/engine
npm install
cp .env.example .env
# set JWT_SECRET and other vars in .env
npm start
```

- To run the UI locally:

```powershell
cd src/ui
npm install
cp .env.example .env
# set NEXT_PUBLIC_ENGINE_URL to the engine URL (e.g. http://localhost:3001)
npm run dev
```

If you modify API routes in the engine, update `doc/engine-api.md` and the UI pages that call those endpoints.
