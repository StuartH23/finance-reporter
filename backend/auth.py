"""Authentication dependencies for API routes."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Header, HTTPException, Request, status

LOCAL_AUTH_MODES = {"disabled", "local", "off", "none"}
PRODUCTION_ENVS = {"prod", "production"}


class AuthConfigurationError(RuntimeError):
    """Raised when auth is enabled but required configuration is missing."""


@dataclass(frozen=True)
class CurrentUser:
    """Authenticated user context derived from Cognito or local dev settings."""

    user_id: str
    email: str | None = None
    scopes: tuple[str, ...] = ()
    token_use: str | None = None
    auth_mode: str = "disabled"


@dataclass(frozen=True)
class AuthSettings:
    """Runtime authentication settings sourced from environment variables."""

    mode: str
    app_env: str
    dev_user_id: str
    cognito_region: str | None = None
    cognito_user_pool_id: str | None = None
    cognito_app_client_id: str | None = None
    cognito_required_scopes: tuple[str, ...] = ()

    @property
    def cognito_issuer(self) -> str:
        if not self.cognito_region or not self.cognito_user_pool_id:
            raise AuthConfigurationError("Cognito region and user pool ID are required.")
        return (
            f"https://cognito-idp.{self.cognito_region}.amazonaws.com/"
            f"{self.cognito_user_pool_id}"
        )

    @property
    def cognito_jwks_url(self) -> str:
        return f"{self.cognito_issuer}/.well-known/jwks.json"


def _split_scopes(raw_value: str | None) -> tuple[str, ...]:
    if not raw_value:
        return ()
    return tuple(scope for scope in raw_value.replace(",", " ").split() if scope)


def get_auth_settings() -> AuthSettings:
    """Read auth settings on demand so tests and deployments can override env cleanly."""
    mode = os.getenv("AUTH_MODE", "disabled").strip().lower()
    app_env = os.getenv("APP_ENV", "development").strip().lower()

    if mode in LOCAL_AUTH_MODES and app_env in PRODUCTION_ENVS:
        raise AuthConfigurationError("AUTH_MODE cannot be disabled when APP_ENV=production.")

    settings = AuthSettings(
        mode=mode,
        app_env=app_env,
        dev_user_id=os.getenv("DEV_USER_ID", "local-dev-user"),
        cognito_region=os.getenv("COGNITO_REGION"),
        cognito_user_pool_id=os.getenv("COGNITO_USER_POOL_ID"),
        cognito_app_client_id=os.getenv("COGNITO_APP_CLIENT_ID"),
        cognito_required_scopes=_split_scopes(os.getenv("COGNITO_REQUIRED_SCOPES")),
    )

    if mode == "cognito":
        missing = [
            name
            for name, value in (
                ("COGNITO_REGION", settings.cognito_region),
                ("COGNITO_USER_POOL_ID", settings.cognito_user_pool_id),
                ("COGNITO_APP_CLIENT_ID", settings.cognito_app_client_id),
            )
            if not value
        ]
        if missing:
            raise AuthConfigurationError(f"Missing Cognito auth config: {', '.join(missing)}")
    elif mode not in LOCAL_AUTH_MODES:
        raise AuthConfigurationError(f"Unsupported AUTH_MODE '{mode}'.")

    return settings


def _auth_header_error(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise _auth_header_error("Missing bearer token.")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _auth_header_error("Authorization header must use the Bearer scheme.")

    return token.strip()


def _configuration_error(exc: AuthConfigurationError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(exc),
    )


def _load_jwt_modules():
    try:
        import jwt
        from jwt import InvalidTokenError, PyJWKClient
    except ModuleNotFoundError as exc:
        raise AuthConfigurationError(
            "PyJWT[crypto] is required when AUTH_MODE=cognito."
        ) from exc
    return jwt, InvalidTokenError, PyJWKClient


@lru_cache(maxsize=8)
def _get_jwk_client(jwks_url: str):
    _, _, py_jwk_client = _load_jwt_modules()
    return py_jwk_client(jwks_url, cache_keys=True)


def _decode_cognito_access_token(token: str, settings: AuthSettings) -> dict[str, Any]:
    jwt, invalid_token_error, _ = _load_jwt_modules()

    try:
        signing_key = _get_jwk_client(settings.cognito_jwks_url).get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.cognito_issuer,
            options={"verify_aud": False},
        )
    except Exception as exc:
        if isinstance(exc, AuthConfigurationError):
            raise
        if isinstance(exc, invalid_token_error):
            raise _auth_header_error("Invalid bearer token.") from exc
        raise _auth_header_error("Unable to verify bearer token.") from exc

    if payload.get("token_use") != "access":
        raise _auth_header_error("Bearer token must be a Cognito access token.")

    if payload.get("client_id") != settings.cognito_app_client_id:
        raise _auth_header_error("Bearer token was issued for the wrong app client.")

    scopes = set(str(payload.get("scope", "")).split())
    missing_scopes = set(settings.cognito_required_scopes) - scopes
    if missing_scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing required scope(s): {', '.join(sorted(missing_scopes))}",
        )

    return payload


def get_current_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    """Require an authenticated user for protected API routes."""
    try:
        settings = get_auth_settings()
    except AuthConfigurationError as exc:
        raise _configuration_error(exc) from exc

    if settings.mode in LOCAL_AUTH_MODES:
        current_user = CurrentUser(user_id=settings.dev_user_id, auth_mode=settings.mode)
        request.state.current_user = current_user
        return current_user

    token = _extract_bearer_token(authorization)
    try:
        payload = _decode_cognito_access_token(token, settings)
    except AuthConfigurationError as exc:
        raise _configuration_error(exc) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise _auth_header_error("Bearer token is missing a subject.")

    current_user = CurrentUser(
        user_id=str(user_id),
        email=payload.get("email"),
        scopes=tuple(str(payload.get("scope", "")).split()),
        token_use=payload.get("token_use"),
        auth_mode=settings.mode,
    )
    request.state.current_user = current_user
    return current_user
