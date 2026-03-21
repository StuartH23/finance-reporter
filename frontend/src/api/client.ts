import type {
  BudgetListResponse,
  FeatureInterestRequest,
  FeatureInterestResponse,
  BudgetUpdateResponse,
  BudgetVsActualResponse,
  CategoryBreakdownResponse,
  LedgerResponse,
  MonthlyPnlResponse,
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

export async function getMonthlyPnl(): Promise<MonthlyPnlResponse> {
  return request<MonthlyPnlResponse>('/pnl/monthly')
}

export async function getYearlyPnl(): Promise<YearlyPnlResponse> {
  return request<YearlyPnlResponse>('/pnl/yearly')
}

export async function getCategoryBreakdown(): Promise<CategoryBreakdownResponse> {
  return request<CategoryBreakdownResponse>('/pnl/categories')
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
