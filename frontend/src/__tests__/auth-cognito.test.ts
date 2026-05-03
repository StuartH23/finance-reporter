import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { completeCognitoSignIn, normalizeAuthReturnPath } from '../auth/cognito'

const originalWindow = globalThis.window

function installWindow(url = 'http://localhost:5173/auth/callback?code=test&state=good') {
  const values = new Map<string, string>([
    ['finance-reporter.auth.pkce.verifier', 'verifier'],
    ['finance-reporter.auth.state', 'good'],
    ['finance-reporter.auth.return_path', '/dashboard?report=transactions'],
  ])
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { href: url, origin: 'http://localhost:5173' },
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      clearTimeout,
      setTimeout,
      atob: globalThis.atob,
    },
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  })
})

describe('Cognito return paths', () => {
  it('keeps same-origin app paths', () => {
    expect(normalizeAuthReturnPath('/budget?month=2026-04#summary')).toBe(
      '/budget?month=2026-04#summary',
    )
    expect(normalizeAuthReturnPath('http://localhost:5173/goals')).toBe('/goals')
  })

  it('falls back when a return path is external or unsafe', () => {
    expect(normalizeAuthReturnPath('https://example.com/budget')).toBe('/')
    expect(normalizeAuthReturnPath('//example.com/budget')).toBe('/')
    expect(normalizeAuthReturnPath('/auth/callback?code=test')).toBe('/')
    expect(normalizeAuthReturnPath('')).toBe('/')
  })

  it('surfaces oauth callback errors directly', async () => {
    installWindow(
      'http://localhost:5173/auth/callback?error=access_denied&error_description=User%20cancelled',
    )

    await expect(completeCognitoSignIn(window.location.href)).rejects.toThrow('User cancelled')
  })

  it('returns the stored dashboard path after a successful token exchange', async () => {
    installWindow()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    } as Response)

    const result = await completeCognitoSignIn(window.location.href)

    expect(result.returnPath).toBe('/dashboard?report=transactions')
  })

  it('maps network failures to a retryable message', async () => {
    installWindow()
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'))

    await expect(completeCognitoSignIn(window.location.href)).rejects.toThrow(
      'Cognito token exchange failed. Check your network connection and retry.',
    )
  })

  it('maps aborted token exchanges to a timeout message', async () => {
    installWindow('http://localhost:5173/auth/callback?code=timeout&state=good')
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })
    globalThis.fetch = vi.fn().mockRejectedValue(abortError)

    await expect(completeCognitoSignIn(window.location.href)).rejects.toThrow(
      'Cognito token exchange timed out. Retry from the dashboard.',
    )
  })

  it('allows retry after a failed token exchange', async () => {
    installWindow('http://localhost:5173/auth/callback?code=retry&state=good')
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      } as Response)
    globalThis.fetch = fetchMock

    await expect(completeCognitoSignIn(window.location.href)).rejects.toThrow(
      'Cognito token exchange failed. Check your network connection and retry.',
    )
    const result = await completeCognitoSignIn(window.location.href)

    expect(result.returnPath).toBe('/dashboard?report=transactions')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
