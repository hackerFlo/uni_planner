# Local development

## First-time setup

1. Copy env templates:
   ```sh
   cp server/.env.example server/.env
   ```
2. Fill in `server/.env`:
   - Generate `JWT_SECRET` and `NOTIFICATION_ENCRYPT_KEY` with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - (Optional) set `SEED_USER_EMAIL` and `SEED_USER_PASSWORD` to auto-create
     a local-only test account on first run.
3. Install deps:
   ```sh
   npm install --prefix server
   npm install --prefix client
   ```

## Running

From the repo root:
```sh
npm run dev
```
- App: http://localhost:5173
- API: http://localhost:3001

Stop everything:
```sh
lsof -ti:3001,5173 | xargs -I{} kill -9 {} 2>/dev/null
```

## Notes

- `server/.env`, `server/planner.db*`, and `node_modules/` are gitignored —
  your local data and credentials never leave your machine.
- The seed user is only created in non-production mode and only when
  `SEED_USER_EMAIL` and `SEED_USER_PASSWORD` are both set in `server/.env`.
