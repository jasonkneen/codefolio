# Codefolio service

`npm run dev` starts the app on port 5173 and this service on loopback port 1234. When no remote URL is configured, the app proxies `/api/assistant`, `/api/rooms` and `/sync` to the local service. The supplied environment example defaults to local storage; configure your own remote deployment in `.env`. `npm run service` starts only the service. The existing notebook execution sandbox is unchanged.

Open **Assistant** in the header. Claude Agent SDK and Codex App Server use the service machine's configured credentials. Claude needs its SDK's bundled executable and a Claude login or `ANTHROPIC_API_KEY`. Codex requires the `codex` executable on PATH and a Codex login. Both run in disposable working directories; the notebook assistant proposes cell edits instead of executing notebook code. Codex runs read-only with approvals disabled. Claude has no tools. Model fields are optional for these providers; the installed provider chooses its default. Enter exact provider-supplied model identifiers to override them.

For Vercel AI Gateway, set `AI_GATEWAY_API_KEY` on the service or enter a key in assistant settings, and supply a model ID. For custom providers, add their full OpenAI-compatible chat-completions URL and model in settings. HTTP is accepted for loopback URLs; other endpoints require HTTPS. Endpoint names, URLs and models are saved locally. API keys and service tokens are held in memory and never saved in browser storage. A provider error or incomplete response prevents proposal application.

Open **Share** to create an invitation for the remotely saved workspace, then send its link. With local-only storage, Share first creates a remote copy. Join opens a separate workspace so the original local desk is preserved. The link contains a random room capability in the fragment. Anyone with it can edit the room. Yjs shares cell source text, cell metadata/order, notebook title/reference/position/size, and canvas edges. Presence includes names, notebook pointers, source editor carets/selections and active assistant tasks. Execution outputs and running state remain local. Reconnect merges the cached Yjs document, including offline edits that survived a reload; leaving keeps a local copy. Switching workspaces disconnects sharing.

Room state is persisted to `CODEFOLIO_DATA_DIR`, default `.codefolio-data`, using serialized atomic writes. The service validates documents before accepting updates. It currently supports one service process with one durable volume. Do not run multiple independent replicas against the same rooms. Room creation is currently public to allowed origins; this is capability sharing, not account authentication or a public multi-tenant billing service.

## Remote service

Set `VITE_CODEFOLIO_SERVICE_URL=https://your-service.example` when building the frontend. Set `CODEFOLIO_ALLOWED_ORIGINS` to comma-separated frontend origins on the service. Set `CODEFOLIO_AI_TOKEN` for remote assistant access; clients enter that token in assistant settings. Without it, only loopback AI requests are accepted. Room invitations use their own per-room token. Set `HOST=0.0.0.0` only for a deployed service.

Run Docker commands from the repository root:

```sh
docker build -f server/Dockerfile -t codefolio-service .
```

For Fly.io, change the app name in `server/fly.toml`, create a `codefolio_data` volume, set the allowed origins and assistant token as Fly secrets, then deploy from the root with `fly deploy "$PWD" --config "$PWD/server/fly.toml"`. Keep one machine. Provision provider credentials deliberately. The Debian container bundles Codex CLI 0.157.1, matching the verified local app-server version. Its entrypoint prepares the mounted data directory and drops to the node user. It does not include your local login; configure provider credentials on the host. Gateway/custom endpoints can work remotely with configured keys. Claude's executable requires a supported container platform. Local assistant and shared-room tests do not establish remote provider availability.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT`, `HOST` | Service bind address, defaults 1234 and 127.0.0.1 |
| `CODEFOLIO_DATA_DIR` | Durable shared-room directory |
| `CODEFOLIO_ALLOWED_ORIGINS` | Allowed browser origins |
| `CODEFOLIO_AI_TOKEN` | Required bearer token for remote AI requests |
| `AI_GATEWAY_API_KEY` | Optional service Gateway key |
| `CODEFOLIO_CUSTOM_API_KEY` | Optional service custom-provider key |
| `CODEFOLIO_CODEX_COMMAND` | Codex binary override |
| `VITE_CODEFOLIO_SERVICE_URL` | Frontend's remote service URL, build time |

The service TypeScript and tests are included in `npm run typecheck` and `npm test`. SDK and JSON-RPC contracts are covered using controlled fixtures. Actual provider calls require credentials and are separate verification.

## Local installation and credentials

From the repository root, use Node 24 and npm:

```sh
npm ci
cp .env.example .env
npm run dev
```

The app is at http://localhost:5173 and the service health check is at http://127.0.0.1:1234/health. Edit `.env` before starting. Restart the service after changing environment variables. Keep `.env` private.

For Codex, install the verified app-server version and sign in on the service machine:

```sh
npm install -g @openai/codex@0.157.1
codex login
```

Claude's SDK is installed by `npm ci`. Set `ANTHROPIC_API_KEY` in `.env` for API authentication, or configure a supported Claude login for the account running the service. The service does not copy credentials from another computer. Gateway uses `AI_GATEWAY_API_KEY`; custom providers use `CODEFOLIO_CUSTOM_API_KEY` or a key entered in the panel. Enter the exact model identifier supplied by your provider. Custom URLs must include the complete chat-completions path.

In source editors, standalone `@claude`, `@codex`, `@agent` and `/ask`, `/explain`, `/repair`, `/generate` completions open a draft for the current cell. Send the draft from the assistant. Neither selecting a shortcut nor applying a proposal executes code.

## Docker run

After the build command above, create a private environment file with your allowed frontend origin, a random assistant token and any provider API keys. Bind a durable room directory:

```sh
mkdir -p .codefolio-data
docker run --rm --name codefolio-service -p 1234:1234 \
  --env-file .env -e HOST=0.0.0.0 -e CODEFOLIO_DATA_DIR=/data \
  -v "$PWD/.codefolio-data:/data" codefolio-service
```

Use HTTPS when exposing this service remotely. Set the frontend service URL to its HTTPS origin and rebuild. The container has no inherited desktop login. Gateway/custom keys are the simplest deployment path. The service image is built remotely by Fly when deploying.

## Fly.io deployment

Install and authenticate the Fly CLI, then replace the `app` value in `server/fly.toml` with your unique app name. Run these commands from the repository root, substituting the same name and your frontend origin:

```sh
fly apps create YOUR_APP_NAME
fly volumes create codefolio_data --region lhr --size 1 --app YOUR_APP_NAME
fly secrets set --app YOUR_APP_NAME \
  CODEFOLIO_ALLOWED_ORIGINS=https://YOUR_FRONTEND_HOST \
  CODEFOLIO_AI_TOKEN=YOUR_RANDOM_SECRET \
  AI_GATEWAY_API_KEY=YOUR_GATEWAY_KEY
fly deploy "$PWD" --config "$PWD/server/fly.toml" --ha=false
fly scale count 1 --app YOUR_APP_NAME
```

Build the frontend with `VITE_CODEFOLIO_SERVICE_URL=https://YOUR_APP_NAME.fly.dev`. Set that same frontend origin in the service allowed origins. Enter the assistant token in browser settings. The room capability is separate from the assistant token. Keep one service machine and its volume; deleting the volume loses persisted rooms. These are deployment instructions, not a claim that this checkout has been deployed.

## Troubleshooting

- If the app says the service is unavailable, check `/health`, port 1234, and the build-time service URL. `npm run preview` needs a separate `npm run service` process.
- A remote assistant request needs `CODEFOLIO_AI_TOKEN` and the matching token in Assistant settings. Check `CODEFOLIO_ALLOWED_ORIGINS` against the full frontend origin, including its port.
- If a provider fails, verify its login on the service machine or its API key and model. A failed or interrupted response cannot apply changes.
- If an invitation fails on another computer, replace a localhost frontend address with a reachable hosted address and verify WebSocket forwarding for `/sync`.
- Preserve the room data directory across restarts. Local notebooks are stored in the browser's IndexedDB and are separate from shared-room service storage.

## Private deployment configuration

Keep your deployment URL and credentials in ignored `.env` files. Copy `server/fly.toml` to the ignored `server/fly.local.toml`, set your unique app name in that local copy, and deploy using it:

```sh
cp server/fly.toml server/fly.local.toml
# Set your app name in server/fly.local.toml, then:
fly deploy "$PWD" --config "$PWD/server/fly.local.toml" --ha=false
```

The public repository does not provide a shared hosted service. Each installation uses local storage or its own configured deployment. Browser clients can discover the endpoint they connect to; keeping a URL out of the repository does not replace authentication or resource limits.

## Default workspace storage

With `VITE_CODEFOLIO_SERVICE_URL` configured, every workspace automatically uses a remote room, including private workspaces. Sharing exposes the existing workspace capability as an invitation. Without a configured remote URL, normal workspaces remain local; explicit Share can still use the locally running service.

Browsers persist the Yjs document and pending edits to the `codefolio-sync-v1` IndexedDB database. After reconnect or reload, the cached document merges with the room instead of replacing it with a plain notebook snapshot. Temporary remote failures keep cached workspaces editable. If initial room creation fails, reconnecting the browser retries from its local desk.

Names, notebook-relative mouse pointers, source editor carets/selections and agent activity travel through Yjs awareness. Text positions use Yjs relative positions so concurrent edits move carets with their text. Agent markers show the active assistant task; proposals still need explicit application and code is not automatically run.
