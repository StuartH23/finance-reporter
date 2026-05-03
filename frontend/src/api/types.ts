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
  id: string
  date: string
  description: string
  amount: number
  category: string
  source_file: string
  category_edited?: boolean
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
  dominant_category?: string
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
  status_group?: 'active' | 'inactive' | null
  payment_state?: 'paid_ok' | 'paid_variance' | 'upcoming' | 'inactive' | null
  next_due_date?: string | null
  last_paid_amount?: number | null
  manually_managed?: boolean
}

export interface SubscriptionSummary {
  monthly_run_rate: number
  annual_run_rate: number
  active_count: number
  latest_month_total: number
  latest_month_label: string
  latest_month_is_complete: boolean
}

export interface SubscriptionListResponse {
  subscriptions: SubscriptionItem[]
  count: number
  summary: SubscriptionSummary
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

export interface CancelInfoResponse {
  stream_id: string
  merchant: string
  found: boolean
  display_name?: string | null
  cancel_url?: string | null
  support_url?: string | null
  phone?: string | null
  notes?: string | null
}

export type SubscriptionReviewVerdict = 'likely_authorized' | 'review_needed' | 'price_concern'

export interface SubscriptionReviewResponse {
  stream_id: string
  verdict: SubscriptionReviewVerdict
  reason: string
  evidence: string[]
  cached: boolean
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

// Cash flow
export type CashFlowGranularity = 'year' | 'month' | 'quarter'
export type CashFlowGroupBy = 'category' | 'merchant'
export type CashFlowNodeType = 'income' | 'expense' | 'savings' | 'shortfall'

export interface CashFlowPeriod {
  key: string
  label: string
}

export interface CashFlowTotals {
  income: number
  expenses: number
  net: number
  transfers?: number
}

export interface CashFlowNode {
  id: string
  label: string
  type: CashFlowNodeType
  value: number
  group_key: string | null
}

export interface CashFlowLink {
  source: string
  target: string
  value: number
}

export interface CashFlowGroup {
  key: string
  label: string
  amount: number
  transactions: number
}

export interface CashFlowResponse {
  granularity: CashFlowGranularity
  group_by: CashFlowGroupBy
  period_key: string | null
  period_label: string | null
  available_periods: CashFlowPeriod[]
  totals: CashFlowTotals
  nodes: CashFlowNode[]
  links: CashFlowLink[]
  groups: CashFlowGroup[]
  transaction_count: number
}

// Insights
export interface InsightItem {
  id: string
  kind: 'spending_trend' | 'goal_trajectory' | 'cashflow_risk' | 'positive_reinforcement' | string
  title: string
  observation: string
  significance: string
  action: string
  why_this_matters: string
  do_this_now: string
  confidence: number
  template_key: string
  template_vars: Record<string, string | number>
  digest: string
  period_label?: string | null
}

export interface InsightsResponse {
  generated_at: string
  locale: string
  currency: string
  period_label?: string | null
  insights: InsightItem[]
  digest: InsightItem[]
  suppressed: number
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

// Analyst chat
export interface AnalystMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AnalystChatRequest {
  messages: AnalystMessage[]
  demo_ledger_csv?: string
}

export interface AnalystChatResponse {
  content: string
}
