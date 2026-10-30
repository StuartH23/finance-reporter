import { z } from 'zod'

/**
 * Runtime schemas for API payloads. Types are derived with z.infer so the
 * TypeScript types cannot drift from what the client actually validates.
 *
 * These mirror backend/schemas.py by hand. Generating them from FastAPI's
 * OpenAPI document would add a codegen step and a second source that has to
 * stay generated, without making the frontend types any more consistent with
 * the validators. The backend remains the contract; this file is the frontend
 * boundary.
 */

export const transactionIdSchema = z.string().brand<'TransactionId'>()
export type TransactionId = z.infer<typeof transactionIdSchema>

export const fileResultSchema = z.object({
  file: z.string(),
  status: z.enum(['ok', 'error']),
  transactions: z.number(),
  message: z.string().nullish(),
})
export type FileResult = z.infer<typeof fileResultSchema>

export const uploadResponseSchema = z.object({
  files: z.array(fileResultSchema),
  total_transactions: z.number(),
  pnl_transactions: z.number(),
  transfer_transactions: z.number(),
})
export type UploadResponse = z.infer<typeof uploadResponseSchema>

export const transactionSchema = z.object({
  id: transactionIdSchema,
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  category: z.string(),
  source_file: z.string(),
  category_edited: z.boolean().optional(),
})
export type Transaction = z.infer<typeof transactionSchema>

export const ledgerResponseSchema = z.object({
  transactions: z.array(transactionSchema),
  count: z.number(),
})
export type LedgerResponse = z.infer<typeof ledgerResponseSchema>

export const categoryUpdateResponseSchema = z.object({
  id: transactionIdSchema,
  category: z.string(),
  category_edited: z.boolean(),
})
export type CategoryUpdateResponse = z.infer<typeof categoryUpdateResponseSchema>

export const transferSummaryItemSchema = z.object({
  category: z.string(),
  total: z.number(),
  transactions: z.number(),
})
export type TransferSummaryItem = z.infer<typeof transferSummaryItemSchema>

export const transferResponseSchema = z.object({
  transactions: z.array(transactionSchema),
  count: z.number(),
  summary: z.array(transferSummaryItemSchema),
})
export type TransferResponse = z.infer<typeof transferResponseSchema>

export const subscriptionChargePointSchema = z.object({
  date: z.string(),
  amount: z.number(),
})
export type SubscriptionChargePoint = z.infer<typeof subscriptionChargePointSchema>

export const subscriptionItemSchema = z.object({
  stream_id: z.string(),
  merchant: z.string(),
  dominant_category: z.string().optional(),
  cadence: z.string(),
  confidence: z.number(),
  active: z.boolean(),
  ignored: z.boolean(),
  essential: z.boolean(),
  amount: z.number(),
  baseline_amount: z.number(),
  expected_amount: z.number(),
  next_expected_charge_date: z.string().nullable(),
  last_charge_date: z.string(),
  trend: z.string(),
  price_increase: z.boolean(),
  charge_count: z.number(),
  charge_history: z.array(subscriptionChargePointSchema),
  cancellation_candidate: z.boolean(),
  negotiation_opportunity: z.boolean(),
  is_new_recurring: z.boolean(),
  missed_expected_charge: z.boolean(),
  status_group: z.enum(['active', 'inactive']).nullable().optional(),
  payment_state: z.enum(['paid_ok', 'paid_variance', 'upcoming', 'inactive']).nullable().optional(),
  next_due_date: z.string().nullable().optional(),
  last_paid_amount: z.number().nullable().optional(),
  manually_managed: z.boolean().optional(),
})
export type SubscriptionItem = z.infer<typeof subscriptionItemSchema>

export const subscriptionSummarySchema = z.object({
  monthly_run_rate: z.number(),
  annual_run_rate: z.number(),
  active_count: z.number(),
  latest_month_total: z.number(),
  latest_month_label: z.string(),
  latest_month_is_complete: z.boolean(),
})
export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>

export const subscriptionListResponseSchema = z.object({
  subscriptions: z.array(subscriptionItemSchema),
  count: z.number(),
  summary: subscriptionSummarySchema,
})
export type SubscriptionListResponse = z.infer<typeof subscriptionListResponseSchema>

export const subscriptionPreferenceResponseSchema = z.object({
  status: z.string(),
  stream_id: z.string(),
  essential: z.boolean(),
  ignored: z.boolean(),
})
export type SubscriptionPreferenceResponse = z.infer<typeof subscriptionPreferenceResponseSchema>

export const subscriptionAlertSchema = z.object({
  stream_id: z.string(),
  merchant: z.string(),
  alert_type: z.string(),
  message: z.string(),
})
export type SubscriptionAlert = z.infer<typeof subscriptionAlertSchema>

export const subscriptionAlertsResponseSchema = z.object({
  alerts: z.array(subscriptionAlertSchema),
  count: z.number(),
})
export type SubscriptionAlertsResponse = z.infer<typeof subscriptionAlertsResponseSchema>

export const cancelInfoResponseSchema = z.object({
  stream_id: z.string(),
  merchant: z.string(),
  found: z.boolean(),
  display_name: z.string().nullable().optional(),
  cancel_url: z.string().nullable().optional(),
  support_url: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})
export type CancelInfoResponse = z.infer<typeof cancelInfoResponseSchema>

export const subscriptionReviewVerdictSchema = z.enum([
  'likely_authorized',
  'review_needed',
  'price_concern',
])
export type SubscriptionReviewVerdict = z.infer<typeof subscriptionReviewVerdictSchema>

export const subscriptionReviewResponseSchema = z.object({
  stream_id: z.string(),
  verdict: subscriptionReviewVerdictSchema,
  reason: z.string(),
  evidence: z.array(z.string()),
  cached: z.boolean(),
})
export type SubscriptionReviewResponse = z.infer<typeof subscriptionReviewResponseSchema>

export const monthlyPnlSchema = z.object({
  month_str: z.string(),
  income: z.number(),
  expenses: z.number(),
  net: z.number(),
  profitable: z.boolean(),
})
export type MonthlyPnl = z.infer<typeof monthlyPnlSchema>

export const monthlyPnlResponseSchema = z.object({
  months: z.array(monthlyPnlSchema),
})
export type MonthlyPnlResponse = z.infer<typeof monthlyPnlResponseSchema>

export const yearlyPnlSchema = z.object({
  year: z.number(),
  income: z.number(),
  expenses: z.number(),
  net: z.number(),
  profitable: z.boolean(),
})
export type YearlyPnl = z.infer<typeof yearlyPnlSchema>

export const yearlyPnlResponseSchema = z.object({
  years: z.array(yearlyPnlSchema),
})
export type YearlyPnlResponse = z.infer<typeof yearlyPnlResponseSchema>

export const categorySummarySchema = z.object({
  category: z.string(),
  income: z.number(),
  expenses: z.number(),
  net: z.number(),
  transactions: z.number(),
})
export type CategorySummary = z.infer<typeof categorySummarySchema>

export const spendingChartItemSchema = z.object({
  category: z.string(),
  total: z.number(),
  transactions: z.number(),
  percentage: z.number().optional(),
})
export type SpendingChartItem = z.infer<typeof spendingChartItemSchema>

export const categoryBreakdownResponseSchema = z.object({
  categories: z.array(categorySummarySchema),
  spending_chart: z.array(spendingChartItemSchema),
})
export type CategoryBreakdownResponse = z.infer<typeof categoryBreakdownResponseSchema>

export const cashFlowGranularitySchema = z.enum(['year', 'month', 'quarter'])
export type CashFlowGranularity = z.infer<typeof cashFlowGranularitySchema>

export const cashFlowGroupBySchema = z.enum(['category', 'merchant'])
export type CashFlowGroupBy = z.infer<typeof cashFlowGroupBySchema>

export const cashFlowNodeTypeSchema = z.enum(['income', 'expense', 'savings', 'shortfall'])
export type CashFlowNodeType = z.infer<typeof cashFlowNodeTypeSchema>

export const cashFlowPeriodSchema = z.object({
  key: z.string(),
  label: z.string(),
})
export type CashFlowPeriod = z.infer<typeof cashFlowPeriodSchema>

export const cashFlowTotalsSchema = z.object({
  income: z.number(),
  expenses: z.number(),
  net: z.number(),
  transfers: z.number().optional(),
})
export type CashFlowTotals = z.infer<typeof cashFlowTotalsSchema>

export const cashFlowNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: cashFlowNodeTypeSchema,
  value: z.number(),
  group_key: z.string().nullable(),
})
export type CashFlowNode = z.infer<typeof cashFlowNodeSchema>

export const cashFlowLinkSchema = z.object({
  source: z.string(),
  target: z.string(),
  value: z.number(),
})
export type CashFlowLink = z.infer<typeof cashFlowLinkSchema>

export const cashFlowGroupSchema = z.object({
  key: z.string(),
  label: z.string(),
  amount: z.number(),
  transactions: z.number(),
})
export type CashFlowGroup = z.infer<typeof cashFlowGroupSchema>

export const cashFlowResponseSchema = z.object({
  granularity: cashFlowGranularitySchema,
  group_by: cashFlowGroupBySchema,
  period_key: z.string().nullable(),
  period_label: z.string().nullable(),
  available_periods: z.array(cashFlowPeriodSchema),
  totals: cashFlowTotalsSchema,
  nodes: z.array(cashFlowNodeSchema),
  links: z.array(cashFlowLinkSchema),
  groups: z.array(cashFlowGroupSchema),
  transaction_count: z.number(),
})
export type CashFlowResponse = z.infer<typeof cashFlowResponseSchema>

export const insightItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  observation: z.string(),
  significance: z.string(),
  action: z.string(),
  why_this_matters: z.string(),
  do_this_now: z.string(),
  confidence: z.number(),
  template_key: z.string(),
  template_vars: z.record(z.string(), z.union([z.string(), z.number()])),
  digest: z.string(),
  period_label: z.string().nullable().optional(),
})
export type InsightItem = z.infer<typeof insightItemSchema>

export const insightsResponseSchema = z.object({
  generated_at: z.string(),
  locale: z.string(),
  currency: z.string(),
  period_label: z.string().nullable().optional(),
  insights: z.array(insightItemSchema),
  digest: z.array(insightItemSchema),
  suppressed: z.number(),
})
export type InsightsResponse = z.infer<typeof insightsResponseSchema>

export const budgetItemSchema = z.object({
  category: z.string(),
  monthly_budget: z.number(),
})
export type BudgetItem = z.infer<typeof budgetItemSchema>

export const budgetListResponseSchema = z.object({
  budget: z.array(budgetItemSchema),
})
export type BudgetListResponse = z.infer<typeof budgetListResponseSchema>

export const budgetUpdateResponseSchema = z.object({
  status: z.string(),
  categories: z.number(),
})
export type BudgetUpdateResponse = z.infer<typeof budgetUpdateResponseSchema>

export const budgetComparisonSchema = z.object({
  category: z.string(),
  monthly_budget: z.number(),
  avg_actual: z.number(),
  total_actual: z.number(),
  diff: z.number(),
  pct_used: z.number(),
})
export type BudgetComparison = z.infer<typeof budgetComparisonSchema>

export const budgetSummarySchema = z.object({
  monthly_budget: z.number(),
  avg_monthly_spending: z.number(),
  surplus_deficit: z.number(),
  months_of_data: z.number(),
})
export type BudgetSummary = z.infer<typeof budgetSummarySchema>

export const budgetVsActualResponseSchema = z.object({
  comparison: z.array(budgetComparisonSchema),
  summary: z.union([budgetSummarySchema, z.object({}).strict()]),
})
export type BudgetVsActualResponse = z.infer<typeof budgetVsActualResponseSchema>

export const nextBestActionTypeSchema = z.enum([
  'save_transfer',
  'spending_cap',
  'bill_review',
  'debt_extra_payment',
  'subscription_cleanup',
])
export type NextBestActionType = z.infer<typeof nextBestActionTypeSchema>

export const nextBestActionStateSchema = z.enum(['suggested', 'completed', 'dismissed', 'snoozed'])
export type NextBestActionState = z.infer<typeof nextBestActionStateSchema>

export const nextBestActionSchema = z.object({
  action_id: z.string(),
  action_type: nextBestActionTypeSchema,
  title: z.string(),
  rationale: z.string(),
  impact_estimate: z.string(),
  impact_monthly: z.number(),
  score: z.number(),
  state: nextBestActionStateSchema,
})
export type NextBestAction = z.infer<typeof nextBestActionSchema>

export const nextBestActionFeedResponseSchema = z.object({
  feed_date: z.string(),
  count: z.number(),
  actionable_data_exists: z.boolean(),
  actions: z.array(nextBestActionSchema),
})
export type NextBestActionFeedResponse = z.infer<typeof nextBestActionFeedResponseSchema>

export const actionOutcomeSchema = z.enum(['completed', 'dismissed', 'snoozed'])

export const nextBestActionFeedbackResponseSchema = z.object({
  status: z.string(),
  action_id: z.string(),
  outcome: actionOutcomeSchema,
  cooldown_until: z.string().optional(),
  snooze_until: z.string().optional(),
})
export type NextBestActionFeedbackResponse = z.infer<typeof nextBestActionFeedbackResponseSchema>

export const categoryRuleSchema = z.object({
  category: z.string(),
  keywords: z.string(),
})
export type CategoryRule = z.infer<typeof categoryRuleSchema>

export const categoriesResponseSchema = z.object({
  categories: z.array(categoryRuleSchema),
})
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>

export const healthResponseSchema = z.object({
  status: z.string(),
})
export type HealthResponse = z.infer<typeof healthResponseSchema>

export const goalContributionPointSchema = z.object({
  month: z.string(),
  amount: z.number(),
})
export type GoalContributionPoint = z.infer<typeof goalContributionPointSchema>

export const goalSchema = z.object({
  id: z.string(),
  name: z.string(),
  target_amount: z.number(),
  target_date: z.string().nullable(),
  priority: z.number(),
  category: z.string(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  contributed_amount: z.number(),
  remaining_amount: z.number(),
  progress_pct: z.number(),
  contribution_history: z.array(goalContributionPointSchema),
})
export type Goal = z.infer<typeof goalSchema>

export const goalListResponseSchema = z.object({
  goals: z.array(goalSchema),
  count: z.number(),
})
export type GoalListResponse = z.infer<typeof goalListResponseSchema>

export const goalUpsertResponseSchema = z.object({
  status: z.string(),
  goal: goalSchema,
})
export type GoalUpsertResponse = z.infer<typeof goalUpsertResponseSchema>

export const paycheckObligationSchema = z.object({
  name: z.string(),
  amount: z.number(),
})
export type PaycheckObligation = z.infer<typeof paycheckObligationSchema>

export const paycheckGoalAllocationSchema = z.object({
  goal_id: z.string(),
  name: z.string(),
  category: z.string(),
  priority: z.number(),
  target_date: z.string().nullable(),
  recommended_amount: z.number(),
  remaining_after_allocation: z.number(),
  required_per_paycheck: z.number().nullable(),
  feasible: z.boolean().nullable(),
})
export type PaycheckGoalAllocation = z.infer<typeof paycheckGoalAllocationSchema>

export const paycheckModeSchema = z.enum(['balanced', 'aggressive_savings'])

export const paycheckPlanRequestSchema = z.object({
  paycheck_amount: z.number(),
  fixed_obligations: z.array(paycheckObligationSchema),
  safety_buffer: z.number(),
  minimum_emergency_buffer: z.number(),
  mode: paycheckModeSchema,
  paychecks_per_month: z.number(),
  goal_ids: z.array(z.string()).optional(),
})
export type PaycheckPlanRequest = z.infer<typeof paycheckPlanRequestSchema>

export const paycheckPlanResponseSchema = z.object({
  paycheck_amount: z.number(),
  allocation_mode: z.string(),
  fixed_obligations_total: z.number(),
  needs: z.number(),
  goals: z.number(),
  discretionary: z.number(),
  safety_buffer_reserved: z.number(),
  goal_allocations: z.array(paycheckGoalAllocationSchema),
  warnings: z.array(z.string()),
  explanations: z.array(z.string()),
  what_changed: z.array(z.string()),
})
export type PaycheckPlanResponse = z.infer<typeof paycheckPlanResponseSchema>

export const paycheckPlanSaveRequestSchema = z.object({
  paycheck_amount: z.number(),
  fixed_obligations: z.array(paycheckObligationSchema),
  safety_buffer_reserved: z.number(),
  minimum_emergency_buffer: z.number(),
  mode: paycheckModeSchema,
  needs: z.number(),
  goals: z.number(),
  discretionary: z.number(),
  goal_allocations: z.array(paycheckGoalAllocationSchema),
})
export type PaycheckPlanSaveRequest = z.infer<typeof paycheckPlanSaveRequestSchema>

export const paycheckPlanSaveResponseSchema = z.object({
  status: z.string(),
  plan: z.record(z.string(), z.unknown()),
})
export type PaycheckPlanSaveResponse = z.infer<typeof paycheckPlanSaveResponseSchema>

export const savedPaycheckPlanResponseSchema = z.object({
  status: z.string(),
  plan: z.record(z.string(), z.unknown()),
})
export type SavedPaycheckPlanResponse = z.infer<typeof savedPaycheckPlanResponseSchema>

export const analystMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})
export type AnalystMessage = z.infer<typeof analystMessageSchema>

export const analystMessagesSchema = z.array(analystMessageSchema)

export const analystChatRequestSchema = z.object({
  messages: analystMessagesSchema,
  demo_ledger_csv: z.string().optional(),
})
export type AnalystChatRequest = z.infer<typeof analystChatRequestSchema>

export const analystChatResponseSchema = z.object({
  content: z.string(),
})
export type AnalystChatResponse = z.infer<typeof analystChatResponseSchema>

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})
export type ChatMessage = z.infer<typeof chatMessageSchema>

export const chatResponseSchema = z.object({
  reply: z.string(),
  tool_calls: z.array(z.string()),
})
export type ChatResponse = z.infer<typeof chatResponseSchema>

export type StoredAnalystMessages =
  | { status: 'empty' }
  | { status: 'ok'; messages: AnalystMessage[] }
  | { status: 'invalid' }

export function parseStoredAnalystMessages(raw: string | null): StoredAnalystMessages {
  if (!raw) return { status: 'empty' }
  try {
    const parsed = analystMessagesSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return { status: 'invalid' }
    return { status: 'ok', messages: parsed.data }
  } catch {
    return { status: 'invalid' }
  }
}

export function readStoredAnalystMessages(raw: string | null): AnalystMessage[] {
  const parsed = parseStoredAnalystMessages(raw)
  return parsed.status === 'ok' ? parsed.messages : []
}
