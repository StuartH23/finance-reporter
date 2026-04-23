import { getDemoResponse } from '../demo/demoApi'
import type {
  AnalystChatRequest,
  AnalystChatResponse,
  BudgetListResponse,
  BudgetUpdateResponse,
  BudgetVsActualResponse,
  CashFlowResponse,
  CategoryBreakdownResponse,
  FeatureInterestRequest,
  FeatureInterestResponse,
  GoalListResponse,
  GoalUpsertResponse,
  InsightsResponse,
  LedgerResponse,
  MonthlyPnlResponse,
  NextBestActionFeedbackResponse,
  NextBestActionFeedResponse,
  PaycheckPlanRequest,
  PaycheckPlanResponse,
  PaycheckPlanSaveRequest,
  PaycheckPlanSaveResponse,
  ReminderResponse,
  SavedPaycheckPlanResponse,
  SubscriptionAlertsResponse,
  SubscriptionListResponse,
  SubscriptionPreferenceResponse,
  TransferResponse,
  UploadResponse,
  YearlyPnlResponse,
} from './types'

const BASE = '/api'

type AccessTokenProvider = () => Promise<string | null> | string | null

let accessTokenProvider: AccessTokenProvider | null = null

export function setAccessTokenProvider(provider: AccessTokenProvider | null) {
  accessTokenProvider = provider
}

async function withAuthHeader(options?: RequestInit): Promise<RequestInit | undefined> {
  if (!accessTokenProvider) return options

  const token = await accessTokenProvider()
  if (!token) return options

  const headers = new Headers(options?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...options, headers }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const demoResponse = getDemoResponse<T>(path, options)
  if (demoResponse !== null) return demoResponse

  const res = await fetch(`${BASE}${path}`, await withAuthHeader(options))
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export async function uploadFiles(files: FileList | File[]): Promise<UploadResponse> {
  const form = new FormData()
  for (const file of files) {
    form.append('files', file)
  }
  return request<UploadResponse>('/upload', { method: 'POST', body: form })
}

export async function getLedger(): Promise<LedgerResponse> {
  return request<LedgerResponse>('/ledger')
}

export async function getTransfers(): Promise<TransferResponse> {
  return request<TransferResponse>('/ledger/transfers')
}

export async function getSubscriptions(options?: {
  status?: 'all' | 'active' | 'ignored'
  filterIncreased?: boolean
  filterOptional?: boolean
  threshold?: number
}): Promise<SubscriptionListResponse> {
  const params = new URLSearchParams()
  if (options?.status) params.set('status', options.status)
  if (options?.filterIncreased) params.set('filter_increased', 'true')
  if (options?.filterOptional) params.set('filter_optional', 'true')
  if (options?.threshold !== undefined) params.set('threshold', String(options.threshold))
  const qs = params.toString()
  return request<SubscriptionListResponse>(`/subscriptions${qs ? `?${qs}` : ''}`)
}

export async function getSubscriptionAlerts(options?: {
  threshold?: number
  includeMissed?: boolean
}): Promise<SubscriptionAlertsResponse> {
  const params = new URLSearchParams()
  if (options?.threshold !== undefined) params.set('threshold', String(options.threshold))
  if (options?.includeMissed !== undefined) {
    params.set('include_missed', String(options.includeMissed))
  }
  const qs = params.toString()
  return request<SubscriptionAlertsResponse>(`/subscriptions/alerts${qs ? `?${qs}` : ''}`)
}

export async function updateSubscriptionPreferences(
  streamId: string,
  update: { essential?: boolean; ignored?: boolean },
): Promise<SubscriptionPreferenceResponse> {
  return request<SubscriptionPreferenceResponse>(`/subscriptions/${streamId}/preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  })
}

export async function remindCancel(streamId: string): Promise<ReminderResponse> {
  return request<ReminderResponse>(`/subscriptions/${streamId}/remind-cancel`, {
    method: 'POST',
  })
}

export async function getMonthlyPnl(): Promise<MonthlyPnlResponse> {
  return request<MonthlyPnlResponse>('/pnl/monthly')
}

export async function getYearlyPnl(): Promise<YearlyPnlResponse> {
  return request<YearlyPnlResponse>('/pnl/yearly')
}

export async function getCategoryBreakdown(options?: {
  year?: number
}): Promise<CategoryBreakdownResponse> {
  const params = new URLSearchParams()
  if (options?.year !== undefined) params.set('year', String(options.year))
  const qs = params.toString()
  return request<CategoryBreakdownResponse>(`/pnl/categories${qs ? `?${qs}` : ''}`)
}

export async function getCashFlow(options?: {
  granularity?: 'month' | 'quarter'
  groupBy?: 'category' | 'merchant'
  period?: string
}): Promise<CashFlowResponse> {
  const params = new URLSearchParams()
  if (options?.granularity) params.set('granularity', options.granularity)
  if (options?.groupBy) params.set('group_by', options.groupBy)
  if (options?.period) params.set('period', options.period)
  const qs = params.toString()
  return request<CashFlowResponse>(`/cashflow${qs ? `?${qs}` : ''}`)
}

export async function getInsights(options?: {
  locale?: string
  currency?: string
  confidenceThreshold?: number
}): Promise<InsightsResponse> {
  const params = new URLSearchParams()
  if (options?.locale) params.set('locale', options.locale)
  if (options?.currency) params.set('currency', options.currency)
  if (options?.confidenceThreshold !== undefined) {
    params.set('confidence_threshold', String(options.confidenceThreshold))
  }
  const qs = params.toString()
  return request<InsightsResponse>(`/insights${qs ? `?${qs}` : ''}`)
}

export async function getBudget(): Promise<BudgetListResponse> {
  return request<BudgetListResponse>('/budget')
}

export async function updateBudget(budget: Record<string, number>): Promise<BudgetUpdateResponse> {
  return request<BudgetUpdateResponse>('/budget', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ budget }),
  })
}

export async function getBudgetVsActual(): Promise<BudgetVsActualResponse> {
  return request<BudgetVsActualResponse>('/budget/vs-actual')
}

export async function getGoals(): Promise<GoalListResponse> {
  return request<GoalListResponse>('/goals')
}

export async function createGoal(payload: {
  name: string
  target_amount: number
  target_date?: string | null
  priority: number
  category: string
  status: string
}): Promise<GoalUpsertResponse> {
  return request<GoalUpsertResponse>('/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function updateGoal(
  goalId: string,
  payload: {
    name: string
    target_amount: number
    target_date?: string | null
    priority: number
    category: string
    status: string
  },
): Promise<GoalUpsertResponse> {
  return request<GoalUpsertResponse>(`/goals/${goalId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function recommendPaycheckPlan(
  payload: PaycheckPlanRequest,
): Promise<PaycheckPlanResponse> {
  return request<PaycheckPlanResponse>('/goals/paycheck-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function savePaycheckPlan(
  payload: PaycheckPlanSaveRequest,
): Promise<PaycheckPlanSaveResponse> {
  return request<PaycheckPlanSaveResponse>('/goals/paycheck-plan/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getSavedPaycheckPlan(): Promise<SavedPaycheckPlanResponse> {
  return request<SavedPaycheckPlanResponse>('/goals/paycheck-plan/saved')
}

export async function getNextBestActionFeed(): Promise<NextBestActionFeedResponse> {
  return request<NextBestActionFeedResponse>('/actions/feed')
}

export async function submitActionFeedback(
  actionId: string,
  payload: { outcome: 'completed' | 'dismissed' | 'snoozed'; snoozeDays?: number },
): Promise<NextBestActionFeedbackResponse> {
  return request<NextBestActionFeedbackResponse>(`/actions/${actionId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      outcome: payload.outcome,
      snooze_days: payload.snoozeDays,
    }),
  })
}

export async function submitFeatureInterest(
  data: FeatureInterestRequest,
): Promise<FeatureInterestResponse> {
  return request<FeatureInterestResponse>('/feature-interest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export class AnalystRateLimitError extends Error {
  retryAfterSeconds: number
  constructor(retryAfterSeconds: number) {
    super('Rate limit reached — 5 questions per 30 min.')
    this.name = 'AnalystRateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export async function postAnalystChat(payload: AnalystChatRequest): Promise<AnalystChatResponse> {
  const init = await withAuthHeader({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const res = await fetch(`${BASE}/analyst/chat`, init)
  if (res.status === 429) {
    const retryAfter = Number.parseInt(res.headers.get('Retry-After') ?? '1800', 10)
    throw new AnalystRateLimitError(Number.isFinite(retryAfter) ? retryAfter : 1800)
  }
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as AnalystChatResponse
}
