# AWS MVP Readiness

## Current State

The app is a Vite React frontend with a FastAPI backend. For the fastest AWS MVP,
the repo now supports a single container image:

```text
React build artifacts -> copied into Python image -> FastAPI serves:
  /api/*        backend API
  /assets/*     Vite assets
  /screenshots/* preview images
  /*            React SPA fallback to index.html
```

This keeps the first AWS deployment simple: one App Runner service can host the full
app under one HTTPS hostname. We can split the frontend to S3/CloudFront later when
we want CDN tuning, static hosting cost optimization, or independent deploys.

Auth is already wired for Cognito Authorization Code + PKCE in the browser and Cognito
access-token verification in FastAPI. The backend health endpoint is public at
`/api/health`; finance routes require `AUTH_MODE=cognito` in production.

Local verification on April 19, 2026:

- Backend: `.venv/bin/pytest -q` passes with 69 tests.
- Frontend: `npm test` passes with 39 tests.
- Frontend: `npm run typecheck` passes.
- Frontend: `npm run lint` passes after excluding generated `dist`.
- Frontend: `npm run build` produces `frontend/dist`.

## Recommended MVP Architecture

Start with one public app hostname:

```text
app.example.com
  App Runner service
    single Docker image built from repo-root Dockerfile
```

App Runner deployment:

- Build the image from `Dockerfile`.
- Push it to ECR.
- Create an App Runner service from the ECR image.
- Configure `PORT=8000`, health check path `/api/health`, and production env vars.
- Add a custom domain and ACM-managed TLS through App Runner.

Why one container first:

- No CloudFront behavior routing for `/api/*`.
- No cross-origin API calls.
- Cognito callback and logout URLs point at one app domain.
- The existing relative `/api` frontend client works unchanged.
- Fewer AWS resources to debug during MVP validation.

Why we may split later:

- S3/CloudFront is a better long-term static hosting path.
- Static and API deploys can move independently.
- CloudFront gives better control over edge caching, WAF, and static asset delivery.

## Required Env Vars

Backend/App Runner:

```bash
APP_ENV=production
AUTH_MODE=cognito
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_example
COGNITO_APP_CLIENT_ID=example-client-id
COGNITO_REQUIRED_SCOPES=
CORS_ALLOW_ORIGINS=https://app.example.com
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
FRONTEND_DIST_DIR=/app/frontend/dist
PORT=8000
```

Frontend build:

```bash
VITE_COGNITO_DOMAIN=https://your-cognito-domain.auth.us-east-1.amazoncognito.com
VITE_COGNITO_APP_CLIENT_ID=example-client-id
VITE_COGNITO_REDIRECT_URI=https://app.example.com/auth/callback
VITE_COGNITO_LOGOUT_URI=https://app.example.com/
VITE_COGNITO_SCOPES=openid email profile
```

Because Vite embeds `VITE_*` values at build time, the Docker image must be built with
the correct frontend values for the target environment.

## Cognito Setup

Create one Cognito User Pool and one public web app client.

- Enable Authorization Code grant with PKCE.
- Do not create a client secret for the browser app client.
- Allowed callback URLs:
  - `https://app.example.com/auth/callback`
  - `http://localhost:5173/auth/callback`
- Allowed sign-out URLs:
  - `https://app.example.com/`
  - `http://localhost:5173/`

## MVP Blockers

1. No persistent finance storage.

   Uploads, goals, subscription preferences, and action-feed state are in backend memory.
   A single App Runner instance can demonstrate the app, but data disappears on restart
   and will not survive scale-out. For a user-facing MVP, add Postgres ownership keyed by
   Cognito `sub`.

2. Feature-interest signup writes to a local CSV.

   `backend/routers/feature_interest.py` appends to `backend/data/feature_interest.csv`.
   In a container this is ephemeral. Move this to Postgres, DynamoDB, S3, or disable the
   endpoint before relying on it.

3. File upload limits are undefined.

   The parser reads CSV/PDF uploads into memory. Set request limits and keep the first
   App Runner service small but not tiny. Document the max upload size in product copy
   before opening it up.

4. Observability is minimal.

   App Runner/CloudWatch logs are enough to start, but we still need structured request
   logs, error visibility, and basic alarms for 5xx rate and health check failures.

## Launch Checklist

1. Create AWS resources:
   - Cognito User Pool and app client.
   - ECR repository for the app image.
   - App Runner service from that ECR image.
   - Route 53 + custom domain for the App Runner service.

2. Build and push image:
   - Build from repo root with the target `VITE_*` values passed as Docker build args.
   - Push to ECR.
   - Deploy or redeploy the App Runner service.

   Example:

   ```bash
   docker build \
     --platform linux/amd64 \
     --build-arg VITE_COGNITO_DOMAIN=https://your-cognito-domain.auth.us-east-1.amazoncognito.com \
     --build-arg VITE_COGNITO_APP_CLIENT_ID=example-client-id \
     --build-arg VITE_COGNITO_REDIRECT_URI=https://app.example.com/auth/callback \
     --build-arg VITE_COGNITO_LOGOUT_URI=https://app.example.com/ \
     -t finance-reporter:aws-mvp .
   ```

3. Configure App Runner:
   - Set backend env vars from `backend/.env.example`.
   - Health check path: `/api/health`.
   - Port: `8000`.
   - Start command can use the Dockerfile default.

4. Configure Cognito:
   - Add production callback and logout URLs.
   - Add localhost callback and logout URLs for local testing.
   - Enable hosted UI / managed login.
   - Confirm the app client has no secret.

5. Smoke test:
   - Visit `/`.
   - Sign in with Cognito.
   - Upload a small CSV.
   - Confirm Dashboard, Budget, Goals, Subscriptions, and Cash Flow load.
   - Refresh `/auth/callback`, `/budget`, and `/goals` directly to confirm SPA fallback.
   - Sign out and confirm Cognito logout returns to the app.

## Console-First Setup Notes

If you want to learn the AWS pieces manually, use the console for the resource setup and
only use local terminal commands for Docker build/push.

Recommended order:

1. Pick the app URL first.

   Example: `https://app.example.com`. Cognito and the frontend build both need this
   URL. If you do not use a custom domain on day one, you will need to deploy once to
   get the App Runner default URL, then update Cognito, rebuild the image with that URL,
   and redeploy.

2. Create Cognito in the AWS console.

   - Create a User Pool.
   - Create a public web app client with no client secret.
   - Enable Authorization Code grant.
   - Enable `openid`, `email`, and `profile` scopes.
   - Add callback URL: `https://app.example.com/auth/callback`.
   - Add logout URL: `https://app.example.com/`.
   - Copy the user pool ID, app client ID, region, and Cognito domain into the local env
     files before building the image.

3. Create an ECR repository in the AWS console.

   Name it `finance-reporter` or similar. The ECR console has a "View push commands"
   button that gives the exact local commands for login, tag, and push.

4. Build the image locally from repo root.

   ```bash
   docker build \
     --platform linux/amd64 \
     --build-arg VITE_COGNITO_DOMAIN=https://your-cognito-domain.auth.us-east-1.amazoncognito.com \
     --build-arg VITE_COGNITO_APP_CLIENT_ID=example-client-id \
     --build-arg VITE_COGNITO_REDIRECT_URI=https://app.example.com/auth/callback \
     --build-arg VITE_COGNITO_LOGOUT_URI=https://app.example.com/ \
     -t finance-reporter:aws-mvp .
   ```

5. Push to ECR.

   Use the commands from the ECR console. You will still need an AWS-authenticated
   terminal for the ECR login step, even if you created the repository manually in the
   console.

6. Create App Runner in the AWS console.

   - Source: Container registry.
   - Provider: Amazon ECR.
   - Image: the pushed `finance-reporter` image.
   - Port: `8000`.
   - Health check path: `/api/health`.
   - Runtime env vars: use `backend/.env.example` as the checklist.

7. Attach the custom domain in App Runner.

   Add the DNS records App Runner gives you. After the domain validates and routes,
   test `https://app.example.com/api/health` and then the browser app.

## App Runner Troubleshooting

- If the service pulls the image and then exits with code `255`, check the image
  architecture first. Local Docker builds on Apple Silicon default to `linux/arm64`,
  while this App Runner image should be built as `linux/amd64`.

  ```bash
  docker image inspect finance-reporter:aws-mvp --format '{{.Architecture}} {{.Os}}'
  ```

  Rebuild with:

  ```bash
  docker build --platform linux/amd64 ...
  ```

- App Runner custom-domain linking only works after the service is active/running.
  If the service is `inactive`, fix the deployment first, then retry the domain link.

## Later Production Work

- Add Postgres schema and user-scoped persistence.
- Store raw uploads only if the privacy model changes; otherwise keep parser-only upload
  handling and persist normalized transactions.
- Add database migrations and seed data.
- Add CI/CD for backend image build/push.
- Split frontend to S3/CloudFront if static delivery and cache control become important.
- Add WAF/rate limits before public launch.

## Development TODO

- Keep `run.py` as the local development orchestrator for now. Revisit a production-aware
  mode only if it can cleanly run a single Uvicorn process in containers without bringing
  Vite, Node, or `--reload` into the runtime path.

## AWS References

- App Runner service from source image:
  <https://docs.aws.amazon.com/apprunner/latest/dg/service-source-image.html>
- App Runner environment variables and secret references:
  <https://docs.aws.amazon.com/apprunner/latest/dg/env-variable.html>
- Cognito Authorization Code + PKCE:
  <https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html>
- Cognito app client callback/logout URL rules:
  <https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html>
