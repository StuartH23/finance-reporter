/**
 * Tests for the API client — verifies that each function calls fetch with
 * the correct URL and method, and propagates errors correctly.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getBudget,
  getBudgetQuickCheck,
  getCategoryBreakdown,
  getLedger,
  getMonthlyPnl,
  getTransfers,
  getYearlyPnl,
  updateBudget,
  uploadFiles,
} from '../api/client'

let lastUrl: string
let lastOptions: RequestInit | undefined

function fakeFetch(url: string | URL | Request, options?: RequestInit) {
  lastUrl = String(url)
  lastOptions = options
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ mock: true }),
  } as Response)
}

function failingFetch() {
  return Promise.resolve({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    json: () => Promise.resolve({}),
  } as Response)
}

beforeEach(() => {
  lastUrl = ''
  lastOptions = undefined
  globalThis.fetch = fakeFetch as unknown as typeof fetch
})

describe('API client', () => {
  it('getLedger calls GET /api/ledger', async () => {
    await getLedger()
    expect(lastUrl).toBe('/api/ledger')
    expect(lastOptions?.method).toBeUndefined()
  })

  it('getTransfers calls GET /api/ledger/transfers', async () => {
    await getTransfers()
    expect(lastUrl).toBe('/api/ledger/transfers')
  })

  it('getMonthlyPnl calls GET /api/pnl/monthly', async () => {
    await getMonthlyPnl()
    expect(lastUrl).toBe('/api/pnl/monthly')
  })

  it('getYearlyPnl calls GET /api/pnl/yearly', async () => {
    await getYearlyPnl()
    expect(lastUrl).toBe('/api/pnl/yearly')
  })

  it('getCategoryBreakdown calls GET /api/pnl/categories', async () => {
    await getCategoryBreakdown()
    expect(lastUrl).toBe('/api/pnl/categories')
  })

  it('getBudget calls GET /api/budget', async () => {
    await getBudget()
    expect(lastUrl).toBe('/api/budget')
  })

  it('getBudgetQuickCheck calls GET /api/budget/quick-check', async () => {
    await getBudgetQuickCheck()
    expect(lastUrl).toBe('/api/budget/quick-check')
  })

  it('updateBudget calls PUT /api/budget with JSON body', async () => {
    await updateBudget({ Food: 500 })
    expect(lastUrl).toBe('/api/budget')
    expect(lastOptions?.method).toBe('PUT')
    expect(lastOptions?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(lastOptions?.body as string)).toEqual({ budget: { Food: 500 } })
  })

  it('uploadFiles calls POST /api/upload with FormData', async () => {
    const file = new File(['test'], 'test.csv', { type: 'text/csv' })
    await uploadFiles([file])
    expect(lastUrl).toBe('/api/upload')
    expect(lastOptions?.method).toBe('POST')
    expect(lastOptions?.body).toBeInstanceOf(FormData)
  })

  it('throws on non-ok response', async () => {
    globalThis.fetch = failingFetch as unknown as typeof fetch
    await expect(getLedger()).rejects.toThrow('API error: 500 Internal Server Error')
  })
})
