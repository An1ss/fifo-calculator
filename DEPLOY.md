# FIFO Calculator Deployment (Docker + Portainer)

## What is ready

- `Dockerfile` builds a static nginx container on port `8080`.
- `nginx.conf` supports both:
  - `/` (single-app domain), and
  - `/fifo-calculator/` (tools subpath).
- `docker-compose.yml` included for local/VPS stack deploy.

## Local build/run

```bash
docker compose up -d --build
```

App URL (local host): `http://localhost:8080`

## VPS with Portainer

1. Push this repo to git.
2. In Portainer, deploy a stack from that repo (or pull and run compose manually).
3. Expose container port `8080` internally.
4. In your external nginx UI, route one of these:
   - `fifo.postmetadoge.com` -> `http://<container-host>:8080`
   - `tools.postmetadoge.com/fifo-calculator/` -> `http://<container-host>:8080/fifo-calculator/`

## Reverse proxy notes

- If you route with a path prefix, keep trailing slash canonical:
  - `/fifo-calculator` -> `/fifo-calculator/`
- No backend/API required; all processing is client-side in browser.
