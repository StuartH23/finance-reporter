FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /build/frontend

ARG VITE_COGNITO_DOMAIN=""
ARG VITE_COGNITO_APP_CLIENT_ID=""
ARG VITE_COGNITO_REDIRECT_URI=""
ARG VITE_COGNITO_LOGOUT_URI=""
ARG VITE_COGNITO_SCOPES="openid email profile"

ENV VITE_COGNITO_DOMAIN=$VITE_COGNITO_DOMAIN \
    VITE_COGNITO_APP_CLIENT_ID=$VITE_COGNITO_APP_CLIENT_ID \
    VITE_COGNITO_REDIRECT_URI=$VITE_COGNITO_REDIRECT_URI \
    VITE_COGNITO_LOGOUT_URI=$VITE_COGNITO_LOGOUT_URI \
    VITE_COGNITO_SCOPES=$VITE_COGNITO_SCOPES

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim AS app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    FRONTEND_DIST_DIR=/app/frontend/dist

WORKDIR /app/backend

RUN python -m pip install --upgrade pip

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
