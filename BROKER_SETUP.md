# Mission Control per-user Hostinger VPS setup

This is the repeatable setup guide to give SSH Claude when installing the
Mission Control dashboard for a new user on that user's own Hostinger VPS.

The current production model is:

```text
Browser
  -> https://DASHBOARD_DOMAIN
  -> Hostinger VPS Traefik on 80/443
  -> frontend container, static React/Vite build

Browser
  -> https://DASHBOARD_DOMAIN/api/*
  -> Traefik broker router, strip /api
  -> broker container on port 8787, still loopback/private
  -> local OpenClaw service/gateway
```

Do not use Cloudflare Tunnel for new installs. Do not expose the broker on a
public port. Do not put `BROKER_SECRET` in the frontend bundle.

## Final architecture requirements

Use this as the target state for every user VPS:

```text
https://DASHBOARD_DOMAIN/      -> frontend container
https://DASHBOARD_DOMAIN/api/* -> existing broker service on port 8787, strip /api
```

Authentication:

```text
React styled login page
  -> POST /api/login
  -> broker validates DASHBOARD_USERNAME + DASHBOARD_PASSWORD_HASH
  -> broker sets HttpOnly Secure SameSite=Lax session cookie
  -> all later /api calls use credentials: include
```

Important auth rules:

- `VITE_BROKER_SECRET` must be empty in `.env.local`.
- The frontend must never bake `BROKER_SECRET` into JavaScript.
- The broker may keep legacy `Authorization: Bearer BROKER_SECRET` for curl and
  backward compatibility.
- Do not put Traefik BasicAuth on `/api`; BasicAuth uses the same
  `Authorization` header as Bearer auth and can break API calls.
- Temporary Traefik BasicAuth on the frontend is acceptable during migration
  only, but remove it after broker session-cookie auth works.

## Per-user inputs

Replace these before giving the guide to SSH Claude:

```bash
OPENCLAW_PROJECT_DIR=/docker/openclaw-sbif
FRONTEND_CLONE_DIR=/docker/mission-control
FRONTEND_REPO_URL=https://github.com/Cognio-so/Mission_control.git
FRONTEND_APP_SUBDIR=openclaw-ui
DASHBOARD_DOMAIN=dashboard.example.com
```

For each VPS also create or confirm:

```text
DASHBOARD_DOMAIN A record -> VPS public IP
```

If the domain is on Cloudflare DNS, set it to DNS-only/grey-cloud unless Traefik
is already configured for DNS-01 challenges. Hostinger's default Traefik setup
normally uses HTTP-01 and needs direct access.

## Non-negotiable constraints

Give these rules to SSH Claude:

```text
- Do not work from / root.
- Do not reinstall OpenClaw.
- Do not delete volumes.
- Do not destroy existing OpenClaw containers.
- Do not expose broker publicly.
- Do not add "0.0.0.0:8787:8787".
- Keep broker loopback-only if it already has "127.0.0.1:8787:8787".
- Keep OpenClaw gateway/private runtime unchanged.
- Use a separate dashboard subdomain, not the OpenClaw domain.
- Do not stop cloudflared until the new dashboard and /api route are verified.
- Show the docker-compose diff before deploying.
```

## 1. Inspect the existing VPS

Run from the OpenClaw project directory, not `/`:

```bash
cd "$OPENCLAW_PROJECT_DIR"
pwd
docker compose ps
docker ps
docker network ls
cat docker-compose.yml
cat .env
```

Expected on a Hostinger OpenClaw VPS:

```text
- openclaw service already exists
- broker service may already exist
- Traefik container already exists
- Traefik discovers labeled Docker containers
- broker listens on 127.0.0.1:8787 or Docker-internal port 8787
```

Example known-good state from the first VPS:

```text
OpenClaw project: /docker/openclaw-sbif
frontend clone: /docker/mission-control
frontend app: /docker/mission-control/openclaw-ui
dashboard domain: dashboard.srv1760992.hstgr.cloud
broker container: openclaw-sbif-broker-1
broker port: 127.0.0.1:8787->8787/tcp
Traefik: host-network mode with Docker provider and labels
```

If Traefik is host-network with Docker provider and `exposedbydefault=false`,
the frontend and broker only need labels. Usually no Docker network changes are
required.

## 2. Backup before editing

From `OPENCLAW_PROJECT_DIR`:

```bash
cp docker-compose.yml docker-compose.yml.bak.$(date +%F-%H%M)
cp .env .env.bak.$(date +%F-%H%M)
```

Do not continue without backups.

## 3. Clone or update the frontend repo

```bash
if [ ! -d "$FRONTEND_CLONE_DIR/.git" ]; then
  git clone "$FRONTEND_REPO_URL" "$FRONTEND_CLONE_DIR"
else
  cd "$FRONTEND_CLONE_DIR"
  git pull
fi
```

If the repo is private, stop and ask which access method to use:

```text
Best: GitHub deploy key with read-only access.
Fast: temporarily make repo public, clone, then make it private again.
Acceptable: short-lived read-only GitHub PAT, revoked after clone.
Manual: user clones into FRONTEND_CLONE_DIR, then SSH Claude continues.
```

Do not store GitHub tokens in files.

Find the app folder:

```bash
APP_DIR="$FRONTEND_CLONE_DIR/$FRONTEND_APP_SUBDIR"
test -f "$APP_DIR/package.json" || {
  echo "Could not find frontend app at $APP_DIR"
  find "$FRONTEND_CLONE_DIR" -maxdepth 3 -name package.json -print
  exit 1
}
```

## 4. Frontend environment

Create `.env.local` inside the frontend app folder:

```bash
cd "$APP_DIR"
cat > .env.local <<'EOF'
VITE_BROKER_URL=/api
VITE_BROKER_SECRET=
VITE_ORCHESTRATOR_SESSION=main
VITE_DEMO=0
VITE_USE_DEMO_DATA=0
VITE_LOGIN_ENABLED=1
EOF
```

Notes:

- `.env.local` is server-local and must not be committed.
- `VITE_BROKER_SECRET` stays empty for secure session-cookie auth.
- `VITE_LOGIN_ENABLED=1` means the React login gate is active.
- Login credentials are checked by the broker, not by frontend env vars.

## 5. Frontend Docker files

Create `nginx-spa.conf` inside the frontend app folder:

```nginx
server {
  listen 80;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Create `Dockerfile` inside the frontend app folder:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

## 6. Broker environment

The broker must have these variables. Put them in `OPENCLAW_PROJECT_DIR/.env`
or in the broker service environment, matching the existing compose style.

```env
BROKER_SECRET=<random 32-byte hex, unique per VPS>
OPENCLAW_GATEWAY_TOKEN=<existing gateway token if required>
ALLOWED_ORIGINS=https://DASHBOARD_DOMAIN

DASHBOARD_USERNAME=<user login name>
DASHBOARD_PASSWORD_HASH=<bcrypt htpasswd hash>
DASHBOARD_SESSION_SECRET=<random 32-byte hex, unique per VPS>
DASHBOARD_SESSION_TTL_SECONDS=86400
```

Generate values:

```bash
openssl rand -hex 32
docker run --rm httpd:alpine htpasswd -nbB 'USERNAME_HERE' 'PASSWORD_HERE'
```

If the bcrypt hash is placed in `docker-compose.yml` labels or env values, escape
every literal `$` as `$$` for Docker Compose interpolation. If it is placed in a
plain `.env` file, keep single `$`.

The broker still accepts legacy Bearer auth:

```http
Authorization: Bearer BROKER_SECRET
```

But the frontend should use session cookie auth only.

## 7. Docker Compose changes

Edit `OPENCLAW_PROJECT_DIR/docker-compose.yml`.

Add a frontend service:

```yaml
  frontend:
    build: /docker/mission-control/openclaw-ui
    init: true
    labels:
      - traefik.enable=true
      - traefik.http.routers.${COMPOSE_PROJECT_NAME}-frontend.rule=Host(`DASHBOARD_DOMAIN`)
      - traefik.http.routers.${COMPOSE_PROJECT_NAME}-frontend.entrypoints=websecure
      - traefik.http.routers.${COMPOSE_PROJECT_NAME}-frontend.tls.certresolver=letsencrypt
      - traefik.http.services.${COMPOSE_PROJECT_NAME}-frontend.loadbalancer.server.port=80
    restart: unless-stopped
```

Replace `DASHBOARD_DOMAIN` with the real domain. Adjust the build path only if
the actual app folder differs.

Add Traefik labels to the existing broker service:

```yaml
    labels:
      - traefik.enable=true
      - traefik.http.routers.${COMPOSE_PROJECT_NAME}-broker.rule=Host(`DASHBOARD_DOMAIN`) && PathPrefix(`/api`)
      - traefik.http.routers.${COMPOSE_PROJECT_NAME}-broker.entrypoints=websecure
      - traefik.http.routers.${COMPOSE_PROJECT_NAME}-broker.tls.certresolver=letsencrypt
      - traefik.http.routers.${COMPOSE_PROJECT_NAME}-broker.middlewares=${COMPOSE_PROJECT_NAME}-broker-strip
      - traefik.http.middlewares.${COMPOSE_PROJECT_NAME}-broker-strip.stripprefix.prefixes=/api
      - traefik.http.services.${COMPOSE_PROJECT_NAME}-broker.loadbalancer.server.port=8787
```

Keep broker ports private:

```yaml
    ports:
      - "127.0.0.1:8787:8787"
```

Do not change to `0.0.0.0`.

If broker and OpenClaw are in the same compose network, the existing internal
gateway style can stay:

```yaml
    environment:
      - PORT=8787
      - STATE_DIR=/state
      - BROKER_SECRET=${BROKER_SECRET}
      - GATEWAY_URL=ws://openclaw:${PORT}
      - GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
      - DASHBOARD_USERNAME=${DASHBOARD_USERNAME}
      - DASHBOARD_PASSWORD_HASH=${DASHBOARD_PASSWORD_HASH}
      - DASHBOARD_SESSION_SECRET=${DASHBOARD_SESSION_SECRET}
      - DASHBOARD_SESSION_TTL_SECONDS=${DASHBOARD_SESSION_TTL_SECONDS}
```

If the broker runs on host/PM2 instead of Docker, Traefik inside Docker cannot
reach host `127.0.0.1`. Prefer Docker for this stack. If PM2 is unavoidable, add
`host.docker.internal:host-gateway` to Traefik and use a Traefik file-provider
service to `http://host.docker.internal:8787`.

## 8. Broker feature contract

The broker on every VPS must implement these routes.

Public or semi-public auth routes:

```text
GET    /healthz
POST   /login
GET    /session
POST   /logout
```

Protected routes must accept the broker session cookie. They may also accept
legacy `Authorization: Bearer BROKER_SECRET`.

Core:

```text
GET    /health
GET    /agents
GET    /teams
POST   /agents
PATCH  /agents/:id
DELETE /agents/:id
POST   /agents/draft-instructions
GET    /agents/:id/files
GET    /agents/:id/files/:name
PUT    /agents/:id/files/:name
```

Chat:

```text
POST   /chat
GET    /stream?sessionKey=<encoded-session-key>
GET    /chat/history?sessionKey=<encoded-session-key>&limit=50
```

`POST /chat` body:

```json
{
  "message": "user text",
  "agentId": "main",
  "sessionKey": "agent:main:main",
  "effort": "low",
  "attachments": []
}
```

Allowed effort values:

```text
off, minimal, low, medium, high, xhigh
```

Frontend session-key format:

```text
Main:  agent:main:<threadId>
Agent: agent:<agentId>:<threadId>
```

The same session key must be used for:

```text
POST /chat
GET /stream?sessionKey=
GET /chat/history?sessionKey=
```

Uploads:

```text
POST /uploads
```

Upload contract:

```text
- multipart FormData
- field name: file
- credentials: include
- do not set Content-Type manually
- optional X-Session-Key header
- max 25 MB
- max 10 files
- allowed extensions: .txt .md .csv .json .pdf .doc .docx .xls .xlsx .png .jpg .jpeg .webp
- broker writes under /data/uploads
- broker returns files: [{ id, name, mime, size, path }]
- frontend passes returned path back verbatim in /chat attachments
- broker rejects paths outside /data/uploads
```

The broker should prepend a hardened untrusted-file block to the user message so
the agent reads those absolute paths with its file tools. There is no separate
native chat-upload RPC; upload transport is the broker, file reading is done by
the agent inside the container.

Credentials/secrets:

```text
GET    /secrets
POST   /secrets
DELETE /secrets/:key
```

Rules:

```text
- values are write-only
- list returns key names only
- store in server-side global.env or equivalent
- load into every agent environment
```

Cron:

```text
GET    /cron
POST   /cron
POST   /cron/:id/run
POST   /cron/:id/enable
POST   /cron/:id/disable
DELETE /cron/:id
```

Cron job body:

```json
{
  "name": "Weekly rank report",
  "agent": "main",
  "cron": "0 9 * * MON",
  "timezone": "Asia/Kolkata",
  "message": "Run the weekly rank report and summarize actions."
}
```

Other UI routes:

```text
GET    /skills/marketplace
GET    /skills/packs
POST   /skills/marketplace/:id/install
POST   /skills/add
GET    /boards
POST   /boards
GET    /boards/:id
DELETE /boards/:id
POST   /boards/:id/tasks
PATCH  /boards/:id/tasks/:taskId
DELETE /boards/:id/tasks/:taskId
POST   /boards/:id/tasks/:taskId/run
GET    /gateways
```

Response arrays may be returned as:

```json
[]
```

or:

```json
{ "agents": [] }
```

or:

```json
{ "items": [] }
```

or:

```json
{ "data": [] }
```

## 9. Required broker behavior

Agents:

```text
- POST /agents creates real persistent agents, not just frontend records.
- GET /teams returns { teams:[{team, orchestrator, members[]}], ungrouped:[] }.
- DELETE /agents/:id permanently deletes from backend runtime/memory/session files.
- Main is addressable as agentId "main".
- /agents/main/files should expose Main AGENT.md/memory files if available.
```

Chat:

```text
- Main chat with agentId "main" talks to the global main controller.
- Specific agent chat with agentId "<id>" talks to that actual registered agent.
- Broker must route by sessionKey format agent:<agentId>:<threadId>.
- Broker should send SSE named events: ready, chat, agent, session.tool,
  session.operation.
- Chat event JSON should include state delta/final/error/aborted, deltaText on
  delta, message.content on final, runId, brokerSessionKey.
```

Delegation map:

```text
- If broker/OpenClaw emits spawned child sessions with spawnedBy, frontend shows
  them as live sub-agent calls.
- If only operation events exist, include agent id/name/team in operation text so
  frontend can infer the active registered agent.
```

Cron:

```text
- If cron needs OpenClaw admin/operator scope, request and approve it once.
- Verify GET/POST/RUN/ENABLE/DISABLE/DELETE before telling user it is done.
```

Uploads:

```text
- Ensure /data/uploads exists and is readable by the OpenClaw container user.
- Example permissions from working VPS: owned/readable by UID 1000, files 0644.
- Block path traversal.
- Validate all attachment paths in /chat.
```

## 10. Deploy sequence

Before deploy, show the rendered config and diff:

```bash
cd "$OPENCLAW_PROJECT_DIR"
docker compose config
git -C "$FRONTEND_CLONE_DIR" status || true
diff -u docker-compose.yml.bak.* docker-compose.yml || true
```

Stop and ask the user for approval before:

```bash
docker compose up -d --build
```

After approval:

```bash
cd "$OPENCLAW_PROJECT_DIR"
docker compose up -d --build
```

If OpenClaw is recreated only because `.env` changed, that is acceptable as long
as volumes are unchanged and `/data` is preserved. Do not delete volumes.

## 11. Verification commands

Container status:

```bash
cd "$OPENCLAW_PROJECT_DIR"
docker compose ps
docker logs --tail=80 "${COMPOSE_PROJECT_NAME}-frontend-1" || true
docker logs --tail=120 "${COMPOSE_PROJECT_NAME}-broker-1" || true
```

Public routing:

```bash
curl -I "https://DASHBOARD_DOMAIN/"
curl -s "https://DASHBOARD_DOMAIN/api/healthz"
```

Session auth:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "https://DASHBOARD_DOMAIN/api/session"
```

Expected without cookie:

```text
401
```

Login with cookie jar:

```bash
curl -s -c /tmp/mc-cookie.jar \
  -H 'Content-Type: application/json' \
  -d '{"username":"DASHBOARD_USERNAME","password":"PLAIN_PASSWORD_FOR_TEST_ONLY"}' \
  "https://DASHBOARD_DOMAIN/api/login"

curl -s -b /tmp/mc-cookie.jar "https://DASHBOARD_DOMAIN/api/session"
curl -s -b /tmp/mc-cookie.jar "https://DASHBOARD_DOMAIN/api/agents"
```

Legacy Bearer still works:

```bash
source "$OPENCLAW_PROJECT_DIR/.env"
curl -s -H "Authorization: Bearer $BROKER_SECRET" \
  "https://DASHBOARD_DOMAIN/api/agents"
```

Upload verification:

```bash
printf 'hello from upload test\n' >/tmp/upload-test.txt
curl -s -b /tmp/mc-cookie.jar \
  -H "X-Session-Key: agent:main:main" \
  -F "file=@/tmp/upload-test.txt" \
  "https://DASHBOARD_DOMAIN/api/uploads"
```

Chat verification:

```bash
curl -s -b /tmp/mc-cookie.jar \
  -H 'Content-Type: application/json' \
  -d '{"message":"Say ok","agentId":"main","sessionKey":"agent:main:main","effort":"low"}' \
  "https://DASHBOARD_DOMAIN/api/chat"
```

Bundle safety check:

```bash
curl -s "https://DASHBOARD_DOMAIN/" | head
docker exec "${COMPOSE_PROJECT_NAME}-frontend-1" sh -lc \
  "grep -R \"BROKER_SECRET\\|$(source "$OPENCLAW_PROJECT_DIR/.env"; echo "$BROKER_SECRET")\" -n /usr/share/nginx/html || true"
```

Expected:

```text
No broker secret in frontend bundle.
```

Browser checks:

```text
1. Open https://DASHBOARD_DOMAIN.
2. No native browser BasicAuth popup appears.
3. Styled React login page appears.
4. Login works.
5. Settings shows Broker URL: /api and Broker secret: not set.
6. Top bar shows Live.
7. Agents and team tree load.
8. Main chat works.
9. Specific agent chat works.
10. New agent creates a real backend agent.
11. Delete agent removes it from backend.
12. Agent markdown editor opens AGENT.md/memory files.
13. Main markdown editor opens from the Main card pencil.
14. File upload in chat works.
15. Scheduled jobs page lists/creates/runs/deletes cron jobs.
16. Refresh browser; chat history resumes.
17. Sign out returns to login.
```

## 12. Disable old Cloudflare Tunnel

Only after all browser checks pass:

```bash
systemctl status cloudflared --no-pager || true
systemctl disable --now cloudflared || true
```

Then verify:

```bash
curl -I "https://DASHBOARD_DOMAIN/"
curl -s "https://DASHBOARD_DOMAIN/api/healthz"
```

Do not remove Cloudflare resources belonging to other users.

## 13. Common failures

```text
Frontend 404 on refresh:
  nginx-spa.conf missing try_files fallback.

/api returns 404:
  broker Traefik router missing or PathPrefix(`/api`) not matching.

/api returns broker 404:
  StripPrefix(`/api`) missing.

/api returns 502:
  Traefik cannot reach broker container/port.

Login works but agents 401:
  cookie not Secure/SameSite/Path correctly, or broker auth gate not accepting cookie.

Native browser login popup:
  Traefik BasicAuth still attached to frontend router. Remove it after cookie auth works.

Frontend bundle contains BROKER_SECRET:
  .env.local has VITE_BROKER_SECRET set. Set it empty and rebuild frontend.

Upload succeeds but agent cannot read file:
  /data/uploads not mounted/readable in OpenClaw container or file permissions wrong.

Chat only updates after refresh:
  SSE /api/stream route broken, sessionKey mismatch, or broker not forwarding final/delta events.

Coordination map shows only Main:
  broker operation/sub-agent events do not include registered agent id/name/team, or spawnedBy is missing.
```

## 14. Rollback

If routing fails:

```bash
cd "$OPENCLAW_PROJECT_DIR"
cp docker-compose.yml.bak.YYYY-MM-DD-HHMM docker-compose.yml
cp .env.bak.YYYY-MM-DD-HHMM .env
docker compose up -d
```

If old Cloudflare Tunnel was stopped and must be restored:

```bash
systemctl enable --now cloudflared
```

## 15. Copy-paste prompt for SSH Claude

Use this prompt for each new VPS. Replace placeholders first.

```text
We are inside OPENCLAW_PROJECT_DIR on a Hostinger VPS.

Goal:
Deploy the Mission Control React/Vite frontend and configure the existing broker
so the dashboard works from this VPS without Cloudflare Tunnel.

Inputs:
OPENCLAW_PROJECT_DIR=/docker/openclaw-sbif
FRONTEND_CLONE_DIR=/docker/mission-control
FRONTEND_REPO_URL=https://github.com/Cognio-so/Mission_control.git
FRONTEND_APP_SUBDIR=openclaw-ui
DASHBOARD_DOMAIN=REPLACE_WITH_DASHBOARD_DOMAIN

Final routing:
https://DASHBOARD_DOMAIN/      -> frontend container
https://DASHBOARD_DOMAIN/api/* -> broker service on port 8787, strip /api

Final auth:
- Styled React login page only.
- No native browser BasicAuth popup.
- POST /api/login validates username/password on broker.
- Broker sets HttpOnly Secure SameSite=Lax session cookie.
- Frontend .env.local has VITE_BROKER_SECRET empty.
- Frontend bundle must not contain BROKER_SECRET.
- Protected /api routes accept session cookie.
- Legacy Bearer auth may remain for curl.

Hard rules:
- Do not work from / root.
- Do not reinstall OpenClaw.
- Do not delete volumes.
- Do not expose broker publicly.
- Do not add "0.0.0.0:8787:8787".
- Keep broker loopback-only if currently "127.0.0.1:8787:8787".
- Do not stop cloudflared until the new dashboard and /api route are verified.
- Show the docker-compose and .env diff before deploying.

Step 1: inspect
cd OPENCLAW_PROJECT_DIR
pwd
docker compose ps
docker ps
docker network ls
cat docker-compose.yml
cat .env

Step 2: backup
cp docker-compose.yml docker-compose.yml.bak.$(date +%F-%H%M)
cp .env .env.bak.$(date +%F-%H%M)

Step 3: clone or update frontend
if [ ! -d "FRONTEND_CLONE_DIR/.git" ]; then
  git clone FRONTEND_REPO_URL FRONTEND_CLONE_DIR
else
  cd FRONTEND_CLONE_DIR && git pull
fi

If clone fails because the repo is private, stop and ask me for repo access:
Deploy Key, temporary public repo, PAT, or manual clone.

Step 4: locate frontend app
APP_DIR=FRONTEND_CLONE_DIR/FRONTEND_APP_SUBDIR
test -f "$APP_DIR/package.json" || { find FRONTEND_CLONE_DIR -maxdepth 3 -name package.json -print; exit 1; }

Step 5: write frontend .env.local
cd "$APP_DIR"
cat > .env.local <<'EOF'
VITE_BROKER_URL=/api
VITE_BROKER_SECRET=
VITE_ORCHESTRATOR_SESSION=main
VITE_DEMO=0
VITE_USE_DEMO_DATA=0
VITE_LOGIN_ENABLED=1
EOF

Step 6: create frontend nginx-spa.conf
cat > nginx-spa.conf <<'EOF'
server {
  listen 80;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

Step 7: create frontend Dockerfile
cat > Dockerfile <<'EOF'
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
EOF

Step 8: update broker env
Ensure .env has:
BROKER_SECRET=<unique random hex>
ALLOWED_ORIGINS=https://DASHBOARD_DOMAIN
DASHBOARD_USERNAME=<login username>
DASHBOARD_PASSWORD_HASH=<bcrypt htpasswd hash>
DASHBOARD_SESSION_SECRET=<unique random hex>
DASHBOARD_SESSION_TTL_SECONDS=86400

Generate hash with:
docker run --rm httpd:alpine htpasswd -nbB USERNAME PASSWORD

If the hash goes in docker-compose.yml, double every $ as $$.
If the hash goes in .env, keep single $.

Step 9: update docker-compose.yml
Add frontend service with Traefik labels:

frontend:
  build: FRONTEND_CLONE_DIR/FRONTEND_APP_SUBDIR
  init: true
  labels:
    - traefik.enable=true
    - traefik.http.routers.${COMPOSE_PROJECT_NAME}-frontend.rule=Host(`DASHBOARD_DOMAIN`)
    - traefik.http.routers.${COMPOSE_PROJECT_NAME}-frontend.entrypoints=websecure
    - traefik.http.routers.${COMPOSE_PROJECT_NAME}-frontend.tls.certresolver=letsencrypt
    - traefik.http.services.${COMPOSE_PROJECT_NAME}-frontend.loadbalancer.server.port=80
  restart: unless-stopped

Add broker Traefik labels:

labels:
  - traefik.enable=true
  - traefik.http.routers.${COMPOSE_PROJECT_NAME}-broker.rule=Host(`DASHBOARD_DOMAIN`) && PathPrefix(`/api`)
  - traefik.http.routers.${COMPOSE_PROJECT_NAME}-broker.entrypoints=websecure
  - traefik.http.routers.${COMPOSE_PROJECT_NAME}-broker.tls.certresolver=letsencrypt
  - traefik.http.routers.${COMPOSE_PROJECT_NAME}-broker.middlewares=${COMPOSE_PROJECT_NAME}-broker-strip
  - traefik.http.middlewares.${COMPOSE_PROJECT_NAME}-broker-strip.stripprefix.prefixes=/api
  - traefik.http.services.${COMPOSE_PROJECT_NAME}-broker.loadbalancer.server.port=8787

Keep broker ports loopback-only:
ports:
  - "127.0.0.1:8787:8787"

Pass these env vars to broker:
- BROKER_SECRET
- ALLOWED_ORIGINS
- DASHBOARD_USERNAME
- DASHBOARD_PASSWORD_HASH
- DASHBOARD_SESSION_SECRET
- DASHBOARD_SESSION_TTL_SECONDS

Step 10: ensure broker features
Verify or implement these endpoints:
/healthz, /login, /session, /logout, /health, /agents, /teams,
/agents CRUD, /agents/:id/files, /agents/draft-instructions,
/chat, /stream, /chat/history, /uploads, /secrets, /cron CRUD,
/skills, /boards, /gateways.

Uploads must write under /data/uploads and /chat must validate attachment paths.
Cron must support list/create/run/enable/disable/delete.
Agent delete must delete from backend, not only UI.
Main must be agentId "main".

Step 11: show diff and wait
cd OPENCLAW_PROJECT_DIR
docker compose config
diff -u docker-compose.yml.bak.* docker-compose.yml || true
Ask me for approval before docker compose up.

Step 12: deploy after approval
docker compose up -d --build

Step 13: verify
curl -I https://DASHBOARD_DOMAIN/
curl -s https://DASHBOARD_DOMAIN/api/healthz

curl -s -o /dev/null -w '%{http_code}\n' https://DASHBOARD_DOMAIN/api/session

curl -s -c /tmp/mc-cookie.jar \
  -H 'Content-Type: application/json' \
  -d '{"username":"USERNAME","password":"PASSWORD"}' \
  https://DASHBOARD_DOMAIN/api/login

curl -s -b /tmp/mc-cookie.jar https://DASHBOARD_DOMAIN/api/session
curl -s -b /tmp/mc-cookie.jar https://DASHBOARD_DOMAIN/api/agents

source OPENCLAW_PROJECT_DIR/.env
curl -s -H "Authorization: Bearer $BROKER_SECRET" https://DASHBOARD_DOMAIN/api/agents

Check frontend bundle does not contain BROKER_SECRET.

Step 14: browser verification
Ask me to open https://DASHBOARD_DOMAIN and confirm:
- styled login only, no browser popup
- login works
- Settings Broker URL is /api and Broker secret is not set
- Live status
- agents/team tree load
- main chat works
- agent chat works
- create/delete agent works
- agent and main markdown editor opens
- upload file in chat works
- scheduled jobs page works
- refresh resumes chat history
- sign out returns to login

Step 15: disable cloudflared only after browser verification
systemctl status cloudflared --no-pager || true
systemctl disable --now cloudflared || true

Recheck:
curl -I https://DASHBOARD_DOMAIN/
curl -s https://DASHBOARD_DOMAIN/api/healthz
```

