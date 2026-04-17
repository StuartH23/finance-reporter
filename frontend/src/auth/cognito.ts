const TOKEN_STORAGE_KEY = 'finance-reporter.auth.tokens'
const PKCE_VERIFIER_KEY = 'finance-reporter.auth.pkce.verifier'
const AUTH_STATE_KEY = 'finance-reporter.auth.state'
const RETURN_PATH_KEY = 'finance-reporter.auth.return_path'

type TokenResponse = {
  access_token: string
  id_token?: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export type AuthTokens = {
  accessToken: string
  idToken?: string
  refreshToken?: string
  expiresAt: number
  tokenType: string
}

export type AuthClaims = {
  sub?: string
  email?: string
  name?: string
  given_name?: string
  family_name?: string
}

export type CognitoConfig = {
  domain: string
  clientId: string
  redirectUri: string
  logoutUri: string
  scopes: string
}

type CompleteSignInResult = {
  tokens: AuthTokens
  returnPath: string
}

let callbackExchangeKey = ''
let callbackExchangePromise: Promise<CompleteSignInResult> | null = null

function storage() {
  if (typeof window === 'undefined') return null
  return window.sessionStorage
}

function origin() {
  if (typeof window === 'undefined') return 'http://localhost:5173'
  return window.location.origin
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export function getCognitoConfig(): CognitoConfig {
  return {
    domain: stripTrailingSlash(import.meta.env.VITE_COGNITO_DOMAIN ?? ''),
    clientId: import.meta.env.VITE_COGNITO_APP_CLIENT_ID ?? '',
    redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI ?? `${origin()}/auth/callback`,
    logoutUri: import.meta.env.VITE_COGNITO_LOGOUT_URI ?? `${origin()}/`,
    scopes: import.meta.env.VITE_COGNITO_SCOPES ?? 'openid email profile',
  }
}

export function isCognitoConfigured() {
  const config = getCognitoConfig()
  return Boolean(config.domain && config.clientId)
}

function randomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

function base64UrlEncode(input: Uint8Array) {
  let binary = ''
  for (const byte of input) {
    binary += String.fromCharCode(byte)
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Base64Url(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return base64UrlEncode(new Uint8Array(digest))
}

function assertBrowserCrypto() {
  if (typeof window === 'undefined' || !crypto?.subtle || !crypto?.getRandomValues) {
    throw new Error('Browser crypto is required for Cognito PKCE login.')
  }
}

export async function beginCognitoSignIn(returnPath?: string) {
  assertBrowserCrypto()
  const store = storage()
  if (!store) throw new Error('Browser session storage is required for login.')

  const config = getCognitoConfig()
  if (!isCognitoConfigured()) throw new Error('Cognito frontend config is missing.')

  const verifier = randomBase64Url(64)
  const challenge = await sha256Base64Url(verifier)
  const state = randomBase64Url(32)
  const path =
    returnPath ??
    `${window.location.pathname}${window.location.search}${window.location.hash}`.trim()

  store.setItem(PKCE_VERIFIER_KEY, verifier)
  store.setItem(AUTH_STATE_KEY, state)
  store.setItem(RETURN_PATH_KEY, path || '/')

  const url = new URL(`${config.domain}/oauth2/authorize`)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', config.scopes)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('state', state)

  window.location.assign(url.toString())
}

function toTokens(response: TokenResponse): AuthTokens {
  return {
    accessToken: response.access_token,
    idToken: response.id_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    tokenType: response.token_type,
  }
}

function saveTokens(tokens: AuthTokens) {
  storage()?.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens))
}

export function loadTokens(): AuthTokens | null {
  const raw = storage()?.getItem(TOKEN_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthTokens
  } catch {
    clearTokens()
    return null
  }
}

export function clearTokens() {
  const store = storage()
  store?.removeItem(TOKEN_STORAGE_KEY)
  store?.removeItem(PKCE_VERIFIER_KEY)
  store?.removeItem(AUTH_STATE_KEY)
  store?.removeItem(RETURN_PATH_KEY)
}

async function requestTokens(body: URLSearchParams) {
  const config = getCognitoConfig()
  const response = await fetch(`${config.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    let detail = response.statusText
    const text = await response.text()
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: string; error_description?: string }
        detail = parsed.error_description || parsed.error || text
      } catch {
        detail = text
      }
    }
    throw new Error(`Cognito token exchange failed: ${detail || response.status}`)
  }

  return toTokens((await response.json()) as TokenResponse)
}

async function completeCognitoSignInInternal(callbackUrl: string): Promise<CompleteSignInResult> {
  const store = storage()
  if (!store) throw new Error('Browser session storage is required for login.')

  const config = getCognitoConfig()
  const url = new URL(callbackUrl)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  if (error) throw new Error(errorDescription || error)
  if (!code) throw new Error('Cognito callback did not include an authorization code.')
  if (!state || state !== store.getItem(AUTH_STATE_KEY)) {
    throw new Error('Cognito callback state did not match this browser session.')
  }

  const verifier = store.getItem(PKCE_VERIFIER_KEY)
  if (!verifier) throw new Error('Missing Cognito PKCE verifier.')

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  })

  const tokens = await requestTokens(body)
  saveTokens(tokens)

  const returnPath = store.getItem(RETURN_PATH_KEY) || '/'
  store.removeItem(PKCE_VERIFIER_KEY)
  store.removeItem(AUTH_STATE_KEY)
  store.removeItem(RETURN_PATH_KEY)

  return { tokens, returnPath }
}

export function completeCognitoSignIn(callbackUrl = window.location.href) {
  if (callbackExchangePromise && callbackExchangeKey === callbackUrl) {
    return callbackExchangePromise
  }

  callbackExchangeKey = callbackUrl
  callbackExchangePromise = completeCognitoSignInInternal(callbackUrl)
  return callbackExchangePromise
}

async function refreshAccessToken(tokens: AuthTokens) {
  const config = getCognitoConfig()
  if (!tokens.refreshToken) return null

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: tokens.refreshToken,
  })

  const refreshed = await requestTokens(body)
  const merged = {
    ...refreshed,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
  }
  saveTokens(merged)
  return merged
}

export async function getAccessToken() {
  const tokens = loadTokens()
  if (!tokens) return null

  if (tokens.expiresAt - Date.now() > 60_000) {
    return tokens.accessToken
  }

  try {
    const refreshed = await refreshAccessToken(tokens)
    return refreshed?.accessToken ?? null
  } catch {
    clearTokens()
    return null
  }
}

function decodeBase64UrlJson<T>(value: string): T | null {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  try {
    return JSON.parse(window.atob(padded)) as T
  } catch {
    return null
  }
}

export function decodeJwtClaims(token?: string): AuthClaims | null {
  if (!token || typeof window === 'undefined') return null
  const [, payload] = token.split('.')
  if (!payload) return null
  return decodeBase64UrlJson<AuthClaims>(payload)
}

export function getSignedInClaims() {
  return decodeJwtClaims(loadTokens()?.idToken)
}

export function signOutWithCognito() {
  const config = getCognitoConfig()
  clearTokens()

  if (!isCognitoConfigured() || typeof window === 'undefined') {
    return
  }

  const url = new URL(`${config.domain}/logout`)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('logout_uri', config.logoutUri)
  window.location.assign(url.toString())
}
