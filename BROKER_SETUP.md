# OpenClaw Mission Control: per-user Hostinger VPS setup

This is the repeatable setup guide for SSH Claude when installing Mission Control
for one user on that user's own Hostinger VPS.

The new model is:

```text
browser
  -> https://<dashboard-domain>
  -> Hostinger VPS Traefik on 80/443
  -> frontend static app
  -> /api/* routed by Traefik to local broker on 127.0.0.1:8787
  -> broker talks to local OpenClaw gateway over loopback
```

Do not use Cloudflare Tunnel for new users. Hostinger VPS has a public IP and
Hostinger's OpenClaw install usually already runs Traefik as the public reverse
proxy. Keep Traefik as the only process bound to ports `80` and `443`.

## What changed from the old setup

Old setup:

```text
frontend on Vercel
  -> Cloudflare Tunnel hostname
  -> broker on localhost:8787
  -> OpenClaw gateway
```

New setup:

```text
frontend on the same user VPS
  -> same-origin /api
  -> Traefik strips /api and forwards to broker on localhost:8787
  -> OpenClaw gateway
```

Frontend code now defaults to `VITE_BROKER_URL=/api`. For each user, build the UI
on the VPS with:

```env
VITE_BROKER_URL=/api
VITE_BROKER_SECRET=
VITE_ORCHESTRATOR_SESSION=main
VITE_DEMO=0
VITE_USE_DEMO_DATA=0
VITE_LOGIN_ENABLED=1
```

Preferred auth is broker session-cookie auth: React posts credentials to
`/api/login`, the broker sets an HttpOnly cookie, and the frontend never receives
`BROKER_SECRET`. Only set `VITE_BROKER_SECRET=<BROKER_SECRET>` for a legacy broker
that has not implemented session-cookie auth yet.

## Inputs for each user

Collect these before starting:

```bash
export DASHBOARD_DOMAIN="<user-dashboard-domain>"   # e.g. user1.example.com
export VPS_IP="<hostinger-vps-public-ip>"
export BROKER_PORT="8787"
export BROKER_SECRET="$(openssl rand -hex 32)"
```

The user needs a DNS A record:

```text
<DASHBOARD_DOMAIN> -> <VPS_IP>
```

If the domain is managed in Hostinger, create the A record in Hostinger DNS. If
the domain is elsewhere, create it at that DNS provider. Wait until:

```bash
dig +short "$DASHBOARD_DOMAIN"
```

returns the VPS IP.

## 1. Inspect the existing Hostinger/OpenClaw stack

Do not reinstall OpenClaw. Hostinger's one-click OpenClaw VPS should already have
OpenClaw and Traefik running.

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
ss -ltnp | grep -E ':80|:443|:8787|:18789'
openclaw gateway status || true
jq '.gateway' ~/.openclaw/openclaw.json
```

Find the gateway URL and token:

```bash
GATEWAY_PORT="$(openclaw gateway status 2>/dev/null | grep -Eo '127\.0\.0\.1:[0-9]+' | head -1 | cut -d: -f2)"
test -n "$GATEWAY_PORT" || GATEWAY_PORT="18789"

GATEWAY_URL="ws://127.0.0.1:${GATEWAY_PORT}"
GATEWAY_TOKEN="$(jq -r '.gateway.auth.token // empty' ~/.openclaw/openclaw.json)"

echo "$GATEWAY_URL"
test -n "$GATEWAY_TOKEN" && echo "gateway token found"
```

Hostinger deployments sometimes use a non-default gateway port. Always discover
it from the live VPS. Keep the OpenClaw gateway private on loopback. Do not expose
the gateway port publicly.

Also confirm model/provider auth before debugging the broker:

```bash
openclaw models
openclaw logs --follow
```

If model auth is expired, run the appropriate OpenClaw login flow on the VPS.

## 2. Disable old Cloudflare tunnel path, if present

Only do this on a VPS being moved to the per-user Hostinger model.

```bash
systemctl status cloudflared --no-pager || true
systemctl disable --now cloudflared || true
```

Also remove the old Cloudflare public hostname in the Cloudflare dashboard if it
exists. The new public entry point is the user's own domain pointing directly at
the VPS IP.

Do not delete Cloudflare resources for any other live user.

## 3. Install or copy the broker

The broker is the Node service that the Mission Control UI talks to. It exposes
REST + SSE and talks to OpenClaw locally.

Preferred:

```text
copy the known-working broker source from the previous VPS
```

Then create the broker `.env`:

```env
HOST=127.0.0.1
PORT=8787
BROKER_SECRET=<long random value unique to this user/VPS>
GATEWAY_URL=ws://127.0.0.1:<discovered gateway port>
GATEWAY_TOKEN=<gateway token from ~/.openclaw/openclaw.json>
```

Run it under PM2 if it is not containerized:

```bash
npm install
npm install -g pm2
pm2 start broker.mjs --name openclaw-broker --update-env
pm2 save
pm2 startup
```

The broker should listen on `127.0.0.1:8787`, not `0.0.0.0`.

Verify locally:

```bash
H="Authorization: Bearer $BROKER_SECRET"
curl -s http://127.0.0.1:8787/health | jq
curl -s -H "$H" http://127.0.0.1:8787/agents | jq
```

If the broker runs in Docker instead, put it on the same Docker network Traefik
uses and expose only the container port internally.

## 4. Build the frontend on the user's VPS

On the VPS, clone/copy the `openclaw-ui` project.

```bash
cd openclaw-ui
npm ci
cat > .env.local <<EOF
VITE_BROKER_URL=/api
VITE_BROKER_SECRET=
VITE_ORCHESTRATOR_SESSION=main
VITE_DEMO=0
VITE_USE_DEMO_DATA=0
VITE_LOGIN_ENABLED=1
EOF
npm run build
```

The static output is:

```text
openclaw-ui/dist
```

Serve this behind Traefik. Do not run `vite preview` as the production service.

## 5. Route frontend and broker through Traefik

Use this if Hostinger's OpenClaw stack already has Traefik. That is the expected
case. Do not install NGINX on the host unless Traefik is not present.

### Option A: frontend as a static NGINX container behind Traefik

Create `nginx-spa.conf` next to the frontend `dist` directory:

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

Create or extend a Docker Compose file on the same Docker network as Traefik:

```yaml
services:
  mission-control:
    image: nginx:alpine
    restart: unless-stopped
    volumes:
      - ./openclaw-ui/dist:/usr/share/nginx/html:ro
      - ./nginx-spa.conf:/etc/nginx/conf.d/default.conf:ro
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.mission-control.rule=Host(`${DASHBOARD_DOMAIN}`)"
      - "traefik.http.routers.mission-control.entrypoints=websecure"
      - "traefik.http.routers.mission-control.tls=true"
      - "traefik.http.routers.mission-control.tls.certresolver=letsencrypt"
      - "traefik.http.services.mission-control.loadbalancer.server.port=80"
```

Use the actual Traefik entrypoint and cert resolver names from the Hostinger stack.
Common names are `web`, `websecure`, `letsencrypt`, `myresolver`, or `le`.

### Option B: route `/api` to a broker container

If the broker is a Docker service on the same Traefik network, add labels to the
broker service:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.openclaw-broker.rule=Host(`${DASHBOARD_DOMAIN}`) && PathPrefix(`/api`)"
  - "traefik.http.routers.openclaw-broker.entrypoints=websecure"
  - "traefik.http.routers.openclaw-broker.tls=true"
  - "traefik.http.routers.openclaw-broker.tls.certresolver=letsencrypt"
  - "traefik.http.routers.openclaw-broker.middlewares=openclaw-broker-strip"
  - "traefik.http.middlewares.openclaw-broker-strip.stripprefix.prefixes=/api"
  - "traefik.http.services.openclaw-broker.loadbalancer.server.port=8787"
```

The StripPrefix middleware is required because the frontend calls `/api/agents`,
but the broker contract expects `/agents`.

### Option C: route `/api` to a PM2 broker on the host

If the broker is running on the host with PM2, Traefik in Docker cannot use
`127.0.0.1:8787` because that is the Traefik container itself. Use a Traefik file
provider service pointing to the Docker host gateway.

First confirm Traefik has host gateway access. If not, add this to the Traefik
service and recreate only Traefik carefully:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Then add a dynamic file provider config, for example
`dynamic/mission-control.yml`:

```yaml
http:
  routers:
    openclaw-broker:
      rule: "Host(`USER_DOMAIN_HERE`) && PathPrefix(`/api`)"
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
      middlewares:
        - openclaw-broker-strip
      service: openclaw-broker

  middlewares:
    openclaw-broker-strip:
      stripPrefix:
        prefixes:
          - /api

  services:
    openclaw-broker:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:8787"
```

Replace `USER_DOMAIN_HERE` and the cert resolver name. Only use this option if the
Hostinger Traefik stack already enables the file provider.

## 6. Protect the dashboard

At minimum:

```text
- unique BROKER_SECRET per VPS/user
- unique dashboard login username/password per VPS/user
- broker bound to 127.0.0.1 or Docker-internal network only
- OpenClaw gateway bound to loopback only
- firewall exposes only 22, 80, 443
- dashboard domain not shared across users
```

Recommended: add Traefik BasicAuth, OIDC, or another access gate to the dashboard
router. The browser needs to call `/api`, so the same access gate should cover the
frontend and `/api`.

## 7. Verify end to end

Local broker:

```bash
H="Authorization: Bearer $BROKER_SECRET"
curl -s http://127.0.0.1:8787/health | jq
curl -s -H "$H" http://127.0.0.1:8787/agents | jq
```

Public same-origin route:

```bash
curl -I "https://${DASHBOARD_DOMAIN}/"
curl -s "https://${DASHBOARD_DOMAIN}/api/health" | jq
curl -s -H "$H" "https://${DASHBOARD_DOMAIN}/api/agents" | jq
```

Browser checks:

```text
1. Open https://<DASHBOARD_DOMAIN>
2. Settings should show Broker URL: /api
3. Top bar should become Live
4. Agents page should load broker agents
5. Send a chat message
6. Sign out should return to the fixed-credential login screen
7. Activity page should show raw broker/SSE events
8. Refresh the browser and confirm chat history resumes
```

If the UI is offline:

```text
- Check browser DevTools Network for /api/health, /api/agents, /api/stream.
- 404 usually means Traefik did not route /api or did not strip /api.
- 401/403 means VITE_BROKER_SECRET does not match BROKER_SECRET.
- 502 means broker is not reachable from Traefik.
- Live health but failed chat means broker cannot reach OpenClaw gateway or model auth is expired.
```

## 8. Broker endpoint contract

All protected endpoints must accept:

```http
Authorization: Bearer <BROKER_SECRET>
```

The SSE endpoint is:

```text
GET /stream?token=<BROKER_SECRET>
```

Required routes:

```text
GET    /health
GET    /agents
POST   /agents
PATCH  /agents/:id
DELETE /agents/:id
GET    /agents/:id/files
GET    /agents/:id/files/:name
PUT    /agents/:id/files/:name
POST   /agents/draft-instructions
POST   /chat
GET    /stream?token=
GET    /chat/history?sessionKey=&limit=
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
GET    /cron
POST   /cron/:id/run
GET    /gateways
```

Response envelopes may be bare arrays or named arrays:

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

## 9. Per-user checklist for SSH Claude

Use this exact checklist for every new user VPS:

```text
1. Confirm DNS A record points dashboard domain to this VPS IP.
2. Inspect existing Docker/OpenClaw/Traefik. Do not reinstall OpenClaw.
3. Discover gateway port and gateway token.
4. Disable cloudflared only if this VPS was using the old tunnel.
5. Copy/install broker source.
6. Create broker .env with HOST=127.0.0.1, PORT=8787, unique BROKER_SECRET,
   discovered GATEWAY_URL, and GATEWAY_TOKEN.
7. Start broker with PM2 or Docker.
8. Verify local broker /health and /agents.
9. Build frontend with VITE_BROKER_URL=/api and matching VITE_BROKER_SECRET.
10. Serve dist behind Traefik.
11. Add Traefik route for frontend domain.
12. Add Traefik route for Host(domain) && PathPrefix(/api), strip /api, forward to broker.
13. Verify public /, /api/health, /api/agents.
14. Open browser, confirm Settings shows /api and top bar shows Live.
15. Send a chat, refresh, confirm history resumes.
```

## 10. Current code expectations

The frontend source expects same-origin deployment by default:

```text
openclaw-ui/src/store/mission.jsx -> default broker URL: /api
openclaw-ui/src/lib/api.js        -> default broker URL: /api
```

Only override `VITE_BROKER_URL` when the broker is intentionally hosted on a
different origin.

## References

- Traefik: https://doc.traefik.io/traefik/
- Traefik Docker provider: https://doc.traefik.io/traefik/reference/install-configuration/providers/docker/
- Traefik ACME certificates: https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/
- Hostinger VPS: https://www.hostinger.com/vps-hosting
- Hostinger OpenClaw: https://www.hostinger.com/openclaw

## Appendix A. Copy-paste SSH Claude prompt for frontend hosting

Use this prompt when a Hostinger OpenClaw VPS already has:

```text
/docker/<openclaw-project>/docker-compose.yml
openclaw service
broker service
traefik already running
broker route currently exposed by Cloudflare Tunnel or localhost
```

Replace the placeholders before sending it to SSH Claude:

```text
OPENCLAW_PROJECT_DIR=/docker/openclaw-sbif
FRONTEND_CLONE_DIR=/docker/mission-control
FRONTEND_REPO_URL=https://github.com/Cognio-so/Mission_control.git
DASHBOARD_DOMAIN=dashboard.srv1760992.hstgr.cloud
FRONTEND_APP_SUBDIR=openclaw-ui
```

If this is a branded domain such as `mission.cognio.so`, create a DNS-only A record
to the VPS public IP first. If using Cloudflare DNS, it must be grey-cloud/DNS-only
for Traefik Let's Encrypt HTTP-01 issuance unless the Traefik stack is already set
up for DNS challenges.

### Repo access choices

If the frontend repo is private, use one of these options:

```text
Best: create a read-only GitHub Deploy Key for this VPS and clone by SSH.
Fast: temporarily make the repo public, let SSH Claude clone it, then make it private again.
Acceptable: provide a short-lived read-only GitHub PAT and rotate/revoke it after clone.
Manual: clone it yourself into FRONTEND_CLONE_DIR, then tell SSH Claude to continue.
```

Do not commit `.env`, `.env.local`, `BROKER_SECRET`, model tokens, or GitHub tokens.
Do not leave the repo public after the VPS has cloned it.
If `VITE_LOGIN_ENABLED=1`, both `VITE_LOGIN_USERNAME` and
`VITE_LOGIN_PASSWORD` must be set before building; otherwise the login screen
will reject every attempt.

### Prompt

```text
Before making changes, inspect files, show me the planned docker-compose.yml diff,
and wait for my approval.

We are inside OPENCLAW_PROJECT_DIR on a Hostinger VPS.

Goal:
Deploy the Mission Control React/Vite frontend from:
FRONTEND_REPO_URL

Also migrate browser access away from Cloudflare Tunnel to same-VPS Traefik routing.

Important rules:
- Do not work from / root.
- Do not reinstall OpenClaw.
- Do not destroy existing OpenClaw containers.
- Do not expose broker publicly.
- Do not add "0.0.0.0:8787:8787".
- Do not stop Cloudflare Tunnel until the new dashboard domain and /api route are verified.
- Keep OpenClaw gateway/private runtime unchanged.
- Use a separate dashboard subdomain, not the existing OpenClaw domain.
- Keep broker port binding loopback-only if it already exists: "127.0.0.1:8787:8787".

Inputs:
OPENCLAW_PROJECT_DIR=/docker/openclaw-sbif
FRONTEND_CLONE_DIR=/docker/mission-control
FRONTEND_REPO_URL=https://github.com/Cognio-so/Mission_control.git
DASHBOARD_DOMAIN=dashboard.srv1760992.hstgr.cloud
FRONTEND_APP_SUBDIR=openclaw-ui

Required final routing:
https://DASHBOARD_DOMAIN/      -> frontend container
https://DASHBOARD_DOMAIN/api/* -> existing broker service on port 8787, strip /api

Required final auth:
- React renders the styled login page.
- POST /api/login validates username/password on the broker and sets an HttpOnly
  Secure SameSite=Lax session cookie.
- GET /api/session reports whether the browser has a valid session.
- POST /api/logout clears the cookie.
- Protected /api routes accept the session cookie.
- The frontend bundle must not contain BROKER_SECRET.
- Temporary Traefik BasicAuth may stay during migration, but remove it after
  broker session-cookie auth and the React login are verified.

Step 1: Inspect current setup
Run:
pwd
docker compose ps
docker ps
docker network ls
cat docker-compose.yml
cat .env

Confirm:
- .env has BROKER_SECRET.
- broker service exists and listens on port 8787.
- Traefik is already running.
- Existing OpenClaw service is not changed except if env_file changes require recreate.

Step 2: Backup existing files
Run from OPENCLAW_PROJECT_DIR:
cp docker-compose.yml docker-compose.yml.bak.$(date +%F-%H%M)
cp .env .env.bak.$(date +%F-%H%M)

Step 3: Clone or update frontend repo
Use FRONTEND_CLONE_DIR.

If folder does not exist:
git clone FRONTEND_REPO_URL FRONTEND_CLONE_DIR

If folder exists:
cd FRONTEND_CLONE_DIR
git pull

If clone fails because the repo is private, stop and ask me which repo access method
to use: Deploy Key, temporary public repo, PAT, or manual clone. Do not keep retrying.

Step 4: Locate frontend app folder
If this exists:
FRONTEND_CLONE_DIR/FRONTEND_APP_SUBDIR/package.json

Then frontend app folder is:
FRONTEND_CLONE_DIR/FRONTEND_APP_SUBDIR

Otherwise find package.json and ask me before choosing a different app folder.

Step 5: Create frontend .env.local
Read BROKER_SECRET from:
OPENCLAW_PROJECT_DIR/.env

Create this file inside the frontend app folder:

VITE_BROKER_URL=/api
VITE_BROKER_SECRET=
VITE_ORCHESTRATOR_SESSION=main
VITE_DEMO=0
VITE_USE_DEMO_DATA=0
VITE_LOGIN_ENABLED=1

Do not commit .env.local.
Do not bake BROKER_SECRET into the frontend when broker session-cookie auth is enabled.
Only use VITE_BROKER_SECRET for a temporary legacy Bearer-token migration.

Step 6: Add frontend nginx config
Create nginx-spa.conf inside frontend app folder:

server {
  listen 80;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}

Step 7: Add frontend Dockerfile
Create Dockerfile inside frontend app folder:

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

Step 8: Edit OPENCLAW_PROJECT_DIR/docker-compose.yml
Add a new service at the same level as openclaw and broker:

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

If frontend app folder is not FRONTEND_CLONE_DIR/FRONTEND_APP_SUBDIR, adjust the
build path only after showing me the discovered path.

Step 9: Add Traefik labels to existing broker service
Inside the existing broker service, add labels:

labels:
  - traefik.enable=true
  - traefik.http.routers.${COMPOSE_PROJECT_NAME}-broker.rule=Host(`DASHBOARD_DOMAIN`) && PathPrefix(`/api`)
  - traefik.http.routers.${COMPOSE_PROJECT_NAME}-broker.entrypoints=websecure
  - traefik.http.routers.${COMPOSE_PROJECT_NAME}-broker.tls.certresolver=letsencrypt
  - traefik.http.routers.${COMPOSE_PROJECT_NAME}-broker.middlewares=${COMPOSE_PROJECT_NAME}-broker-strip
  - traefik.http.middlewares.${COMPOSE_PROJECT_NAME}-broker-strip.stripprefix.prefixes=/api
  - traefik.http.services.${COMPOSE_PROJECT_NAME}-broker.loadbalancer.server.port=8787

Keep existing broker ports exactly as they are if already loopback-only:
ports:
  - "127.0.0.1:8787:8787"

Do not expose broker publicly.

Step 10: If broker uses ALLOWED_ORIGINS, add the new dashboard origin
If .env contains ALLOWED_ORIGINS, include:
https://DASHBOARD_DOMAIN

Do not remove existing allowed origins unless I explicitly approve it.

Step 11: Show me the diff before deploy
Run:
docker compose config
diff -u docker-compose.yml.bak.* docker-compose.yml || true

Then stop and ask for my approval before running docker compose up.

Step 12: After approval, deploy
Run:
cd OPENCLAW_PROJECT_DIR
docker compose up -d --build

If openclaw is recreated only because .env changed, that is acceptable if volumes
are unchanged and /data is preserved. Do not delete volumes.

Step 13: Verify containers
Run:
docker compose ps
docker logs --tail=80 ${COMPOSE_PROJECT_NAME}-frontend-1 || true
docker logs --tail=80 ${COMPOSE_PROJECT_NAME}-broker-1 || true

Step 14: Verify public frontend and broker route
Run:
curl -I https://DASHBOARD_DOMAIN/
curl -s https://DASHBOARD_DOMAIN/api/healthz || true
curl -s https://DASHBOARD_DOMAIN/api/health || true

Then:
source OPENCLAW_PROJECT_DIR/.env
curl -s -H "Authorization: Bearer $BROKER_SECRET" https://DASHBOARD_DOMAIN/api/agents

Expected:
- / returns frontend HTML with HTTP 200.
- /api/healthz or /api/health returns broker health.
- authenticated /api/agents returns broker agents JSON.

Step 15: Browser verification
Ask me to open:
https://DASHBOARD_DOMAIN

I must confirm:
- Login screen accepts the configured fixed username/password.
- Settings shows Broker URL: /api.
- Top bar shows Live.
- Agents load.
- Sending a chat reaches broker/OpenClaw and returns a response.
- Sign out returns to the login screen.

Step 16: Disable Cloudflare Tunnel only after browser verification passes
Only after I confirm browser checks passed, run:
systemctl status cloudflared --no-pager || true
systemctl disable --now cloudflared || true

After disabling, verify same-VPS route still works:
curl -I https://DASHBOARD_DOMAIN/
curl -s https://DASHBOARD_DOMAIN/api/health || true

Do not remove Cloudflare DNS/tunnel resources for other users.
Do not stop cloudflared before the new same-VPS Traefik routing works.
```

### Proven result from the first Hostinger VPS

This exact flow worked on the VPS where:

```text
OpenClaw project: /docker/openclaw-sbif
frontend clone: /docker/mission-control
frontend app: /docker/mission-control/openclaw-ui
dashboard domain: dashboard.srv1760992.hstgr.cloud
broker container: openclaw-sbif-broker-1
broker port: 127.0.0.1:8787->8787/tcp
Traefik: host-network mode with Docker provider and labels
```

Verified:

```text
GET /                      -> HTTP 200 frontend HTML
GET /api/healthz           -> {"ok":true}
GET /api/health with auth  -> gateway connected true, operator scopes
GET /api/agents with auth  -> Orchestrator + managed agents JSON
Browser Settings           -> Broker URL /api, Live
Browser chat               -> response returned through broker/OpenClaw
```
