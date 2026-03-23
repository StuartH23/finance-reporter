// Upload
export interface FileResult {
  file: string
  status: 'ok' | 'error'
  transactions: number
}

export interface UploadResponse {
  files: FileResult[]
  total_transactions: number
  pnl_transactions: number
  transfer_transactions: number
}

// Ledger
export interface Transaction {
  date: string
  description: string
  amount: number
  category: string
  source_file: string
}

export interface LedgerResponse {
  transactions: Transaction[]
  count: number
}

// Transfers
export interface TransferSummaryItem {
  category: string
  total: number
  transactions: number
}

export interface TransferResponse {
  transactions: Transaction[]
  count: number
  summary: TransferSummaryItem[]
}

// Subscriptions
export interface SubscriptionChargePoint {
  date: string
  amount: number
}

export interface SubscriptionItem {
  stream_id: string
  merchant: string
  cadence: 'weekly' | 'monthly' | 'annual' | string
  confidence: number
  active: boolean
  ignored: boolean
  essential: boolean
  amount: number
  baseline_amount: number
  expected_amount: number
  next_expected_charge_date: string | null
  last_charge_date: string
  trend: 'up' | 'down' | 'flat' | string
  price_increase: boolean
  charge_count: number
  charge_history: SubscriptionChargePoint[]
  cancellation_candidate: boolean
  negotiation_opportunity: boolean
  is_new_recurring: boolean
  missed_expected_charge: boolean
}

export interface SubscriptionListResponse {
  subscriptions: SubscriptionItem[]
  count: number
}

export interface SubscriptionPreferenceResponse {
  status: string
  stream_id: string
  essential: boolean
  ignored: boolean
}

export interface SubscriptionAlert {
  stream_id: string
  merchant: string
  alert_type: string
  message: string
}

export interface SubscriptionAlertsResponse {
  alerts: SubscriptionAlert[]
  count: number
}

export interface ReminderResponse {
  status: string
  stream_id: string
  message: string
}

// P&L
export interface MonthlyPnl {
  month_str: string
  income: number
  expenses: number
  net: number
  profitable: boolean
}

export interface MonthlyPnlResponse {
  months: MonthlyPnl[]
}

export interface YearlyPnl {
  year: number
  income: number
  expenses: number
  net: number
  profitable: boolean
}

export interface YearlyPnlResponse {
  years: YearlyPnl[]
}

// Category breakdown
export interface CategorySummary {
  category: string
  income: number
  expenses: number
  net: number
  transactions: number
}

export interface SpendingChartItem {
  category: string
  total: number
  transactions: number
  percentage?: number
}

export interface CategoryBreakdownResponse {
  categories: CategorySummary[]
  spending_chart: SpendingChartItem[]
}

// Budget
export interface BudgetItem {
  category: string
  monthly_budget: number
}

export interface BudgetListResponse {
  budget: BudgetItem[]
}

export interface BudgetUpdateResponse {
  status: string
  categories: number
}

export interface BudgetComparison {
  category: string
  monthly_budget: number
  avg_actual: number
  total_actual: number
  diff: number
  pct_used: number
}

export interface BudgetSummary {
  monthly_budget: number
  avg_monthly_spending: number
  surplus_deficit: number
  months_of_data: number
}

export interface BudgetVsActualResponse {
  comparison: BudgetComparison[]
  summary: BudgetSummary | Record<string, never>
}

// Next-best actions
export type NextBestActionType =
  | 'save_transfer'
  | 'spending_cap'
  | 'bill_review'
  | 'debt_extra_payment'
  | 'subscription_cleanup'

export type NextBestActionState = 'suggested' | 'completed' | 'dismissed' | 'snoozed'

export interface NextBestAction {
  action_id: string
  action_type: NextBestActionType
  title: string
  rationale: string
  impact_estimate: string
  impact_monthly: number
  score: number
  state: NextBestActionState
}

export interface NextBestActionFeedResponse {
  feed_date: string
  count: number
  actionable_data_exists: boolean
  actions: NextBestAction[]
}

export interface NextBestActionFeedbackResponse {
  status: string
  action_id: string
  outcome: 'completed' | 'dismissed' | 'snoozed'
  cooldown_until?: string
  snooze_until?: string
}

// Feature interest
export interface FeatureInterestRequest {
  email: string
  name?: string
  features: string[]
  notes?: string
}

export interface FeatureInterestResponse {
  status: string
  total_signups: number
  feature_counts: Record<string, number>
}

// Categories
export interface CategoryRule {
  category: string
  keywords: string
}

export interface CategoriesResponse {
  categories: CategoryRule[]
}

// Health
export interface HealthResponse {
  status: string
}
