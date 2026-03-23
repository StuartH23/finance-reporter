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

// Goals
export interface GoalContributionPoint {
  month: string
  amount: number
}

export interface Goal {
  id: string
  name: string
  target_amount: number
  target_date: string | null
  priority: number
  category: string
  status: string
  created_at: string
  updated_at: string
  contributed_amount: number
  remaining_amount: number
  progress_pct: number
  contribution_history: GoalContributionPoint[]
}

export interface GoalListResponse {
  goals: Goal[]
  count: number
}

export interface GoalUpsertResponse {
  status: string
  goal: Goal
}

export interface PaycheckObligation {
  name: string
  amount: number
}

export interface PaycheckGoalAllocation {
  goal_id: string
  name: string
  category: string
  priority: number
  target_date: string | null
  recommended_amount: number
  remaining_after_allocation: number
  required_per_paycheck: number | null
  feasible: boolean | null
}

export interface PaycheckPlanRequest {
  paycheck_amount: number
  fixed_obligations: PaycheckObligation[]
  safety_buffer: number
  minimum_emergency_buffer: number
  mode: 'balanced' | 'aggressive_savings'
  paychecks_per_month: number
  goal_ids?: string[]
}

export interface PaycheckPlanResponse {
  paycheck_amount: number
  allocation_mode: 'balanced' | 'aggressive_savings' | string
  fixed_obligations_total: number
  needs: number
  goals: number
  discretionary: number
  safety_buffer_reserved: number
  goal_allocations: PaycheckGoalAllocation[]
  warnings: string[]
  explanations: string[]
  what_changed: string[]
}

export interface PaycheckPlanSaveRequest {
  paycheck_amount: number
  fixed_obligations: PaycheckObligation[]
  safety_buffer_reserved: number
  minimum_emergency_buffer: number
  mode: 'balanced' | 'aggressive_savings'
  needs: number
  goals: number
  discretionary: number
  goal_allocations: PaycheckGoalAllocation[]
}

export interface PaycheckPlanSaveResponse {
  status: string
  plan: Record<string, unknown>
}

export interface SavedPaycheckPlanResponse {
  status: 'ok' | 'empty' | string
  plan: Record<string, unknown>
}
