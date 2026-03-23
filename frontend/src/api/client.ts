import type {
  BudgetListResponse,
  FeatureInterestRequest,
  FeatureInterestResponse,
  BudgetUpdateResponse,
  BudgetVsActualResponse,
  CategoryBreakdownResponse,
  LedgerResponse,
  InsightsResponse,
  MonthlyPnlResponse,
  ReminderResponse,
  SubscriptionAlertsResponse,
  SubscriptionListResponse,
  SubscriptionPreferenceResponse,
  TransferResponse,
  UploadResponse,
  YearlyPnlResponse,
} from './types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options)
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
  update: { essential?: boolean; ignored?: boolean }
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

export async function getCategoryBreakdown(): Promise<CategoryBreakdownResponse> {
  return request<CategoryBreakdownResponse>('/pnl/categories')
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

export async function submitFeatureInterest(
  data: FeatureInterestRequest
): Promise<FeatureInterestResponse> {
  return request<FeatureInterestResponse>('/feature-interest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}
