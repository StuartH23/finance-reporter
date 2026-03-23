/**
 * Tests for the API client — verifies that each function calls fetch with
 * the correct URL and method, and propagates errors correctly.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createGoal,
  getBudget,
  getCategoryBreakdown,
  getGoals,
  getLedger,
  getMonthlyPnl,
  getSavedPaycheckPlan,
  recommendPaycheckPlan,
  savePaycheckPlan,
  getSubscriptionAlerts,
  getSubscriptions,
  getTransfers,
  getYearlyPnl,
  remindCancel,
  submitFeatureInterest,
  updateSubscriptionPreferences,
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

  it('getSubscriptions calls GET /api/subscriptions with filters', async () => {
    await getSubscriptions({
      status: 'active',
      filterIncreased: true,
      filterOptional: true,
      threshold: 0.2,
    })
    expect(lastUrl).toBe(
      '/api/subscriptions?status=active&filter_increased=true&filter_optional=true&threshold=0.2'
    )
  })

  it('getSubscriptionAlerts calls GET /api/subscriptions/alerts', async () => {
    await getSubscriptionAlerts({ threshold: 0.15, includeMissed: false })
    expect(lastUrl).toBe('/api/subscriptions/alerts?threshold=0.15&include_missed=false')
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

  it('getGoals calls GET /api/goals', async () => {
    await getGoals()
    expect(lastUrl).toBe('/api/goals')
  })

  it('createGoal calls POST /api/goals', async () => {
    await createGoal({
      name: 'Emergency Fund',
      target_amount: 1000,
      target_date: '2026-12-31',
      priority: 1,
      category: 'emergency',
      status: 'active',
    })
    expect(lastUrl).toBe('/api/goals')
    expect(lastOptions?.method).toBe('POST')
  })

  it('updateBudget calls PUT /api/budget with JSON body', async () => {
    await updateBudget({ Food: 500 })
    expect(lastUrl).toBe('/api/budget')
    expect(lastOptions?.method).toBe('PUT')
    expect(lastOptions?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(lastOptions?.body as string)).toEqual({ budget: { Food: 500 } })
  })

  it('recommendPaycheckPlan calls POST /api/goals/paycheck-plan', async () => {
    await recommendPaycheckPlan({
      paycheck_amount: 2000,
      fixed_obligations: [{ name: 'Rent', amount: 1000 }],
      safety_buffer: 150,
      minimum_emergency_buffer: 100,
      mode: 'balanced',
      paychecks_per_month: 2,
    })
    expect(lastUrl).toBe('/api/goals/paycheck-plan')
    expect(lastOptions?.method).toBe('POST')
  })

  it('savePaycheckPlan calls POST /api/goals/paycheck-plan/save', async () => {
    await savePaycheckPlan({
      paycheck_amount: 2000,
      fixed_obligations: [{ name: 'Rent', amount: 1000 }],
      safety_buffer_reserved: 150,
      minimum_emergency_buffer: 100,
      mode: 'balanced',
      needs: 1000,
      goals: 550,
      discretionary: 300,
      goal_allocations: [],
    })
    expect(lastUrl).toBe('/api/goals/paycheck-plan/save')
    expect(lastOptions?.method).toBe('POST')
  })

  it('getSavedPaycheckPlan calls GET /api/goals/paycheck-plan/saved', async () => {
    await getSavedPaycheckPlan()
    expect(lastUrl).toBe('/api/goals/paycheck-plan/saved')
  })

  it('uploadFiles calls POST /api/upload with FormData', async () => {
    const file = new File(['test'], 'test.csv', { type: 'text/csv' })
    await uploadFiles([file])
    expect(lastUrl).toBe('/api/upload')
    expect(lastOptions?.method).toBe('POST')
    expect(lastOptions?.body).toBeInstanceOf(FormData)
  })

  it('submitFeatureInterest calls POST /api/feature-interest with JSON body', async () => {
    await submitFeatureInterest({
      email: 'user@example.com',
      features: ['Goal Buckets'],
    })
    expect(lastUrl).toBe('/api/feature-interest')
    expect(lastOptions?.method).toBe('POST')
    expect(lastOptions?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(lastOptions?.body as string)).toEqual({
      email: 'user@example.com',
      features: ['Goal Buckets'],
    })
  })

  it('updateSubscriptionPreferences calls POST with JSON body', async () => {
    await updateSubscriptionPreferences('abc123', { ignored: true })
    expect(lastUrl).toBe('/api/subscriptions/abc123/preferences')
    expect(lastOptions?.method).toBe('POST')
    expect(lastOptions?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(lastOptions?.body as string)).toEqual({ ignored: true })
  })

  it('remindCancel calls POST /api/subscriptions/:id/remind-cancel', async () => {
    await remindCancel('abc123')
    expect(lastUrl).toBe('/api/subscriptions/abc123/remind-cancel')
    expect(lastOptions?.method).toBe('POST')
  })

  it('throws on non-ok response', async () => {
    globalThis.fetch = failingFetch as unknown as typeof fetch
    await expect(getLedger()).rejects.toThrow('API error: 500 Internal Server Error')
  })
})
