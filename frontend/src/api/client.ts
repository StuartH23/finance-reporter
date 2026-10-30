type SchemaParser<T> = {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false }
}

import { getDemoResponse } from '../demo/demoApi'
import {
  analystChatResponseSchema,
  budgetListResponseSchema,
  budgetUpdateResponseSchema,
  budgetVsActualResponseSchema,
  cancelInfoResponseSchema,
  cashFlowResponseSchema,
  categoryBreakdownResponseSchema,
  categoryUpdateResponseSchema,
  chatResponseSchema,
  featureInterestResponseSchema,
  goalListResponseSchema,
  goalUpsertResponseSchema,
  insightsResponseSchema,
  ledgerResponseSchema,
  monthlyPnlResponseSchema,
  nextBestActionFeedbackResponseSchema,
  nextBestActionFeedResponseSchema,
  paycheckPlanResponseSchema,
  paycheckPlanSaveResponseSchema,
  savedPaycheckPlanResponseSchema,
  subscriptionAlertsResponseSchema,
  subscriptionListResponseSchema,
  subscriptionPreferenceResponseSchema,
  subscriptionReviewResponseSchema,
  transferResponseSchema,
  uploadResponseSchema,
  yearlyPnlResponseSchema,
} from './schemas'
import type {
  AnalystChatRequest,
  AnalystChatResponse,
  BudgetListResponse,
  BudgetUpdateResponse,
  BudgetVsActualResponse,
  CancelInfoResponse,
  CashFlowResponse,
  CategoryBreakdownResponse,
  CategoryUpdateResponse,
  ChatMessage,
  ChatResponse,
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
  SavedPaycheckPlanResponse,
  SubscriptionAlertsResponse,
  SubscriptionListResponse,
  SubscriptionPreferenceResponse,
  SubscriptionReviewResponse,
  TransactionId,
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

function parseApiPayload<T>(path: string, schema: SchemaParser<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new Error(`API response did not match the expected shape for ${path}.`)
  }
  return parsed.data
}

async function request<T>(
  path: string,
  schema: SchemaParser<T>,
  options?: RequestInit,
): Promise<T> {
  const demoResponse = getDemoResponse(path, options)
  if (demoResponse !== null) return parseApiPayload(path, schema, demoResponse)

  const res = await fetch(`${BASE}${path}`, await withAuthHeader(options))
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    throw new Error(`API response did not match the expected shape for ${path}.`)
  }
  return parseApiPayload(path, schema, payload)
}

async function requestBlob(path: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, await withAuthHeader(options))
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
  return res
}

export async function uploadFiles(files: FileList | File[]): Promise<UploadResponse> {
  const form = new FormData()
  for (const file of files) {
    form.append('files', file)
  }
  return request('/upload', uploadResponseSchema, { method: 'POST', body: form })
}

export async function getLedger(): Promise<LedgerResponse> {
  return request('/ledger', ledgerResponseSchema)
}

export interface LedgerTransactionOptions {
  granularity?: 'year' | 'month' | 'quarter' | undefined
  period?: string | undefined
  category?: string | undefined
  type?: 'income' | 'spending' | 'transfer' | undefined
  sourceFile?: string | undefined
  search?: string | undefined
  sort?: 'date' | 'description' | 'amount' | 'category' | 'source_file' | undefined
  direction?: 'asc' | 'desc' | undefined
}

function ledgerTransactionParams(options?: LedgerTransactionOptions) {
  const params = new URLSearchParams()
  if (options?.granularity) params.set('granularity', options.granularity)
  if (options?.period) params.set('period', options.period)
  if (options?.category) params.set('category', options.category)
  if (options?.type) params.set('type', options.type)
  if (options?.sourceFile) params.set('source_file', options.sourceFile)
  if (options?.search) params.set('search', options.search)
  if (options?.sort) params.set('sort', options.sort)
  if (options?.direction) params.set('direction', options.direction)
  return params
}

export async function getLedgerTransactions(
  options?: LedgerTransactionOptions,
): Promise<LedgerResponse> {
  const qs = ledgerTransactionParams(options).toString()
  return request(`/ledger/transactions${qs ? `?${qs}` : ''}`, ledgerResponseSchema)
}

export function ledgerTransactionsExportUrl(
  options?: LedgerTransactionOptions & { format?: 'csv' | 'xlsx' },
): string {
  const params = ledgerTransactionParams(options)
  params.set('format', options?.format ?? 'csv')
  const qs = params.toString()
  return `${BASE}/ledger/transactions/export${qs ? `?${qs}` : ''}`
}

export async function exportLedgerTransactions(
  options?: LedgerTransactionOptions & { format?: 'csv' | 'xlsx' },
): Promise<{ blob: Blob; filename: string }> {
  const params = ledgerTransactionParams(options)
  params.set('format', options?.format ?? 'csv')
  const qs = params.toString()
  const res = await requestBlob(`/ledger/transactions/export${qs ? `?${qs}` : ''}`)
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/)
  const filename =
    filenameMatch?.[1] ?? `transactions-export.${options?.format === 'xlsx' ? 'xlsx' : 'csv'}`
  return { blob: await res.blob(), filename }
}

export async function updateTransactionCategory(
  transactionId: TransactionId,
  category: string,
): Promise<CategoryUpdateResponse> {
  return request(
    `/ledger/transactions/${encodeURIComponent(transactionId)}/category`,
    categoryUpdateResponseSchema,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    },
  )
}

export async function getTransfers(): Promise<TransferResponse> {
  return request('/ledger/transfers', transferResponseSchema)
}

export async function getSubscriptions(options?: {
  status?: 'all' | 'active' | 'ignored'
  filterIncreased?: boolean
  filterOptional?: boolean
  threshold?: number
  view?: 'all' | 'upcoming'
  statusGroup?: 'active' | 'inactive'
  month?: string
  sort?: 'priority' | 'due_asc' | 'due_desc' | 'amount_desc'
  page?: number
  pageSize?: number
}): Promise<SubscriptionListResponse> {
  const params = new URLSearchParams()
  if (options?.status) params.set('status', options.status)
  if (options?.filterIncreased) params.set('filter_increased', 'true')
  if (options?.filterOptional) params.set('filter_optional', 'true')
  if (options?.threshold !== undefined) params.set('threshold', String(options.threshold))
  if (options?.view) params.set('view', options.view)
  if (options?.statusGroup) params.set('status_group', options.statusGroup)
  if (options?.month) params.set('month', options.month)
  if (options?.sort) params.set('sort', options.sort)
  if (options?.page !== undefined) params.set('page', String(options.page))
  if (options?.pageSize !== undefined) params.set('page_size', String(options.pageSize))
  const qs = params.toString()
  return request(`/subscriptions${qs ? `?${qs}` : ''}`, subscriptionListResponseSchema)
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
  return request(`/subscriptions/alerts${qs ? `?${qs}` : ''}`, subscriptionAlertsResponseSchema)
}

export async function updateSubscriptionPreferences(
  streamId: string,
  update: { essential?: boolean; ignored?: boolean },
): Promise<SubscriptionPreferenceResponse> {
  return request(`/subscriptions/${streamId}/preferences`, subscriptionPreferenceResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  })
}

export async function getCancelInfo(streamId: string): Promise<CancelInfoResponse> {
  return request(`/subscriptions/${streamId}/cancel-info`, cancelInfoResponseSchema)
}

export async function reviewSubscription(streamId: string): Promise<SubscriptionReviewResponse> {
  return request(`/subscriptions/${streamId}/review`, subscriptionReviewResponseSchema, {
    method: 'POST',
  })
}

export async function getMonthlyPnl(): Promise<MonthlyPnlResponse> {
  return request('/pnl/monthly', monthlyPnlResponseSchema)
}

export async function getYearlyPnl(): Promise<YearlyPnlResponse> {
  return request('/pnl/yearly', yearlyPnlResponseSchema)
}

export async function getCategoryBreakdown(options?: {
  year?: number | undefined
}): Promise<CategoryBreakdownResponse> {
  const params = new URLSearchParams()
  if (options?.year !== undefined) params.set('year', String(options.year))
  const qs = params.toString()
  return request(`/pnl/categories${qs ? `?${qs}` : ''}`, categoryBreakdownResponseSchema)
}

export async function getCashFlow(options?: {
  granularity?: 'year' | 'month' | 'quarter' | undefined
  groupBy?: 'category' | 'merchant' | undefined
  period?: string | undefined
}): Promise<CashFlowResponse> {
  const params = new URLSearchParams()
  if (options?.granularity) params.set('granularity', options.granularity)
  if (options?.groupBy) params.set('group_by', options.groupBy)
  if (options?.period) params.set('period', options.period)
  const qs = params.toString()
  return request(`/cashflow${qs ? `?${qs}` : ''}`, cashFlowResponseSchema)
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
  return request(`/insights${qs ? `?${qs}` : ''}`, insightsResponseSchema)
}

export async function getBudget(): Promise<BudgetListResponse> {
  return request('/budget', budgetListResponseSchema)
}

export async function updateBudget(budget: Record<string, number>): Promise<BudgetUpdateResponse> {
  return request('/budget', budgetUpdateResponseSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ budget }),
  })
}

export async function getBudgetVsActual(): Promise<BudgetVsActualResponse> {
  return request('/budget/vs-actual', budgetVsActualResponseSchema)
}

export async function getGoals(): Promise<GoalListResponse> {
  return request('/goals', goalListResponseSchema)
}

export async function createGoal(payload: {
  name: string
  target_amount: number
  target_date?: string | null
  priority: number
  category: string
  status: string
}): Promise<GoalUpsertResponse> {
  return request('/goals', goalUpsertResponseSchema, {
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
  return request(`/goals/${goalId}`, goalUpsertResponseSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function recommendPaycheckPlan(
  payload: PaycheckPlanRequest,
): Promise<PaycheckPlanResponse> {
  return request('/goals/paycheck-plan', paycheckPlanResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function savePaycheckPlan(
  payload: PaycheckPlanSaveRequest,
): Promise<PaycheckPlanSaveResponse> {
  return request('/goals/paycheck-plan/save', paycheckPlanSaveResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getSavedPaycheckPlan(): Promise<SavedPaycheckPlanResponse> {
  return request('/goals/paycheck-plan/saved', savedPaycheckPlanResponseSchema)
}

export async function getNextBestActionFeed(): Promise<NextBestActionFeedResponse> {
  return request('/actions/feed', nextBestActionFeedResponseSchema)
}

export async function submitActionFeedback(
  actionId: string,
  payload: { outcome: 'completed' | 'dismissed' | 'snoozed'; snoozeDays?: number },
): Promise<NextBestActionFeedbackResponse> {
  return request(`/actions/${actionId}/feedback`, nextBestActionFeedbackResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      outcome: payload.outcome,
      snooze_days: payload.snoozeDays,
    }),
  })
}

export type { ChatMessage, ChatResponse }

export async function sendChat(messages: ChatMessage[]): Promise<ChatResponse> {
  return request('/chat', chatResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
}

export async function submitFeatureInterest(
  data: FeatureInterestRequest,
): Promise<FeatureInterestResponse> {
  return request('/feature-interest', featureInterestResponseSchema, {
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
  const isDemoChat = Boolean(payload.demo_ledger_csv)
  const path = isDemoChat ? '/demo/analyst/chat' : '/analyst/chat'
  const demoCredentials: RequestCredentials = 'include'
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    ...(isDemoChat ? { credentials: demoCredentials } : {}),
  }
  const authed = isDemoChat ? init : await withAuthHeader(init)
  const res = await fetch(`${BASE}${path}`, authed)
  if (res.status === 429) {
    const retryAfter = Number.parseInt(res.headers.get('Retry-After') ?? '1800', 10)
    throw new AnalystRateLimitError(Number.isFinite(retryAfter) ? retryAfter : 1800)
  }
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new Error(`API response did not match the expected shape for ${path}.`)
  }
  return parseApiPayload(path, analystChatResponseSchema, body)
}

export type DemoTransaction = {
  date: string
  description: string
  amount: number
  category: string
  source_file: string
}

export async function seedDemoSession(transactions: DemoTransaction[]): Promise<void> {
  await fetch(`${BASE}/demo/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions }),
    credentials: 'include',
  })
}

export async function clearDemoSession(): Promise<void> {
  await fetch(`${BASE}/demo/clear`, {
    method: 'POST',
    credentials: 'include',
  })
}
