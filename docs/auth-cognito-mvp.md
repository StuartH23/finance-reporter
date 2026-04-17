# Cognito Auth MVP

## What Cognito Owns

Amazon Cognito is the external identity provider for the MVP. It owns signup, login,
password reset, MFA policy, token issuance, and user identity IDs.

The app should treat the Cognito access token `sub` claim as the stable user boundary.
Every persisted user-owned row should be scoped by that user ID.

## Backend Contract

Protected API routes require:

```http
Authorization: Bearer <cognito-access-token>
```

`/api/health` and `/api/categories` are intentionally public read-only routes. All write
routes and all user finance data routes are protected by `get_current_user`.

Local development defaults to `AUTH_MODE=disabled`, which returns `DEV_USER_ID` as the
current user. Production fails closed if auth is disabled.

## Environment Variables

```bash
APP_ENV=production
AUTH_MODE=cognito
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_example
COGNITO_APP_CLIENT_ID=example-client-id
COGNITO_REQUIRED_SCOPES=
```

Optional local value:

```bash
DEV_USER_ID=local-dev-user
```

Current local test values are stored in ignored local env files:

- `backend/.env.local`
- `frontend/.env.local`

The Cognito app client ID and user pool ID are not secrets, but local env files are kept out
of git so different developers and environments can use different pools.

`frontend/.env.local` is loaded by Vite. `backend/.env.local` is loaded by the repo-root
`run.py` helper before it starts Uvicorn.

## AWS Setup Targets

1. Create one Cognito User Pool for the MVP environment.
2. Create one app client for the React app.
3. Use Authorization Code + PKCE for browser login.
4. Configure callback/logout URLs for the CloudFront app domain and local dev.
5. Pass Cognito access tokens to FastAPI as bearer tokens.
6. Add API Gateway JWT authorizer later using the same issuer and app client.

## Next Backend Step

After Postgres is added, replace session-only ownership with user-scoped queries:

```text
current_user.user_id -> users.cognito_sub -> uploads/transactions/budgets/goals
```

The existing `session_id` cookie can remain temporarily for upload-flow continuity, but it
must not be the authorization boundary once production users exist.

## Guest Demo Boundary

Guest mode is not an authenticated user. It is read-only demo mode with sample data.

- no personal uploads
- no backend finance API calls
- no budget/goal/subscription/action writes
- no feature-interest signup writes
- no persistence beyond local browser demo state

Guests must sign in with email or Google before uploading statements or saving changes.
