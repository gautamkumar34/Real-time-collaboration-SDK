# Deploy CollabDoc (minimal production)

Code changes are in place: **server** uses `CORS_ORIGIN`, **`GET /health`**, production `npm start` → `node dist/index.js`; **demo-app** reads **`VITE_SERVER_URL`**.

## 1. Deploy the Socket.IO server (Render)

**Option A — Blueprint**

1. Push this repo to GitHub.
2. In [Render](https://render.com): **New** → **Blueprint** → select the repo.
3. Approve the `render.yaml` service (or create manually below).

**Option B — Web Service (manual)**

| Setting | Value |
|--------|--------|
| Root directory | `server` |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Health check path | `/health` |

**Environment variables**

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | After Vercel is live: `https://<your-project>.vercel.app` (comma-separated if multiple). For a first test you can use `*` then tighten. |

Copy the service **HTTPS URL** (example: `https://collab-server-xxxx.onrender.com`).

## 2. Deploy the demo (Vercel)

1. [Vercel](https://vercel.com) → **Add New Project** → import the same repo.
2. **Root Directory:** `demo-app` (important: monorepo).
3. **Environment Variables** (Production):

   | Name | Value |
   |-----|--------|
   | `VITE_SERVER_URL` | Your Render HTTPS URL, **no trailing slash** (e.g. `https://collab-server-xxxx.onrender.com`) |

4. Deploy. Open the Vercel URL and confirm the app connects (browser devtools → Network → `socket.io`).

## 3. Finalize CORS

Set Render `CORS_ORIGIN` to your exact Vercel origin: `https://<name>.vercel.app`, then **Manual Deploy** the Render service so clients are not blocked.

## 4. Verify

```bash
curl -sS https://<render-host>/health
# {"status":"ok","service":"collab-server"}
```

Open two browser windows on the Vercel URL; edits should sync.

## Local development

- **Server:** `cd server && npm run dev` (uses `ts-node`).
- **Demo:** create `demo-app/.env` with `VITE_SERVER_URL=http://localhost:8080` and `npm run dev` in `demo-app`.

See also `server/.env.example` and `demo-app/.env.example`.
