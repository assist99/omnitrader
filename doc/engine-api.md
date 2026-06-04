# Engine API Reference

Base path: `/api`

Auth
- `POST /api/auth/register` — create a new user. Body: `{ email, password }`.
- `POST /api/auth/login` — login. Body: `{ email, password }`. Returns `{ token }`.
- `GET /api/auth/me` — get current user (Authorization required).
- `PATCH /api/auth/password` — change password (Authorization required).

Accounts
- `GET /api/accounts` — list accounts for the authenticated user.
- `POST /api/accounts` — create account (saves encrypted API keys).
- `PUT /api/accounts/:id` — update account (owner only).
- `DELETE /api/accounts/:id` — delete account (owner only).

Setups
- `GET /api/setups` — list user's setups (supports `status`, `page`, `limit`, `search`).
- `POST /api/setups` — create a new trading setup.
- `GET /api/setups/:id` — get setup details (includes orders).
- `PUT /api/setups/:id` — update a setup (owner only).
- `DELETE /api/setups/:id` — delete a setup (soft by default; `?hard=true` to delete).

Orders
- `GET /api/orders?setup_id=<id>` — list orders for a setup (owner only).

Users
- `PATCH /api/users/telegram` — update user's `telegram_chat_id`.
- `POST /api/users/telegram/test` — send a test notification to a chat id.

System
- `GET /api/system/health` — returns basic health info.

Authentication
- Provide `Authorization: Bearer <token>` header for protected endpoints.
- JWT secret: set `JWT_SECRET` in the engine `.env`.

Environment
- `NEXT_PUBLIC_ENGINE_URL` — URL the UI uses to call the engine (set in `src/ui/.env` or hosting environment).
- Engine `.env` variables: `JWT_SECRET`, `API_PORT` (or `PORT`), DB path, Telegram credentials, etc.
