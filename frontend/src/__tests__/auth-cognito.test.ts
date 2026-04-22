import { describe, expect, it } from 'vitest'

import { normalizeAuthReturnPath } from '../auth/cognito'

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
})
