import { z } from 'zod'

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

function isIsoTimestamp(value: string): boolean {
  return value.includes('T') && Number.isFinite(Date.parse(value))
}

const money = z.number().finite()
const wholeNumber = z.number().int()
const isoDate = z.string().refine(isIsoDate, 'Expected YYYY-MM-DD')
const nullableDate = isoDate.nullable()
const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const timestamp = z.string().refine(isIsoTimestamp, 'Expected an ISO-8601 timestamp')

export const transactionBackupSchema = z.object({
  id: z.string(),
  date: isoDate,
  description: z.string(),
  amount: money,
  category: z.string(),
  source_file: z.string(),
  category_edited: z.boolean(),
})

export const budgetBackupSchema = z.object({
  category: z.string(),
  monthly_budget: money,
})

export const categoryRuleBackupSchema = z.object({
  category: z.string(),
  keywords: z.string(),
})

export const subscriptionBackupSchema = z.object({
  stream_id: z.string(),
  merchant: z.string(),
  dominant_category: z.string(),
  cadence: z.string(),
  amount: money,
  baseline_amount: money,
  expected_amount: money,
  last_paid_amount: money.nullable(),
  confidence: money,
  active: z.boolean(),
  ignored: z.boolean(),
  essential: z.boolean(),
  manually_managed: z.boolean(),
  price_increase: z.boolean(),
  cancellation_candidate: z.boolean(),
  negotiation_opportunity: z.boolean(),
  is_new_recurring: z.boolean(),
  missed_expected_charge: z.boolean(),
  charge_count: wholeNumber,
  trend: z.string(),
  last_charge_date: isoDate,
  next_expected_charge_date: nullableDate,
  next_due_date: nullableDate,
  status_group: z.string().nullable(),
  payment_state: z.string().nullable(),
})

export const subscriptionChargeBackupSchema = z.object({
  stream_id: z.string(),
  date: isoDate,
  amount: money,
})

export const goalBackupSchema = z.object({
  id: z.string(),
  name: z.string(),
  target_amount: money,
  target_date: nullableDate,
  priority: wholeNumber,
  category: z.string(),
  status: z.string(),
  created_at: timestamp,
  updated_at: timestamp,
  contributed_amount: money,
  remaining_amount: money,
  progress_pct: money,
})

export const goalContributionBackupSchema = z.object({
  goal_id: z.string(),
  month: isoMonth,
  amount: money,
})

export const paycheckPlanBackupSchema = z.object({
  paycheck_amount: money,
  allocation_mode: z.string(),
  fixed_obligations_total: money,
  needs: money,
  goals_amount: money,
  discretionary: money,
  safety_buffer_reserved: money,
  minimum_emergency_buffer: money,
  saved_at: timestamp,
})

export const paycheckAllocationBackupSchema = z.object({
  goal_id: z.string(),
  name: z.string(),
  category: z.string(),
  priority: wholeNumber,
  target_date: nullableDate,
  recommended_amount: money,
  remaining_after_allocation: money,
  required_per_paycheck: money.nullable(),
  feasible: z.boolean().nullable(),
})

export const actionFeedbackBackupSchema = z.object({
  action_id: z.string(),
  status: z.string(),
  action_type: z.string(),
  updated_at: timestamp,
  cooldown_until: nullableDate,
  snooze_until: nullableDate,
})

export const actionHistoryBackupSchema = z.object({
  action_id: z.string(),
  action_type: z.string(),
  outcome: z.string(),
  at: timestamp,
})

export const actionTypeBiasBackupSchema = z.object({
  action_type: z.string(),
  bias: money,
})

export const actionMetricWeightBackupSchema = z.object({
  metric: z.string(),
  weight: money,
})

export const actionCatalogBackupSchema = z.object({
  action_id: z.string(),
  action_type: z.string(),
  title: z.string(),
  impact_score: money,
  urgency_score: money,
  confidence_score: money,
  effort_score: money,
})

export const backupDocumentSchema = z
  .object({
    version: z.literal(1),
    exported_at: timestamp,
    transactions: z.array(transactionBackupSchema),
    budgets: z.array(budgetBackupSchema),
    category_rules: z.array(categoryRuleBackupSchema),
    subscriptions: z.array(subscriptionBackupSchema),
    subscription_charges: z.array(subscriptionChargeBackupSchema),
    goals: z.array(goalBackupSchema),
    goal_contributions: z.array(goalContributionBackupSchema),
    paycheck_plan: z.array(paycheckPlanBackupSchema),
    paycheck_allocations: z.array(paycheckAllocationBackupSchema),
    action_feedback: z.array(actionFeedbackBackupSchema),
    action_history: z.array(actionHistoryBackupSchema),
    action_type_bias: z.array(actionTypeBiasBackupSchema),
    action_metric_weights: z.array(actionMetricWeightBackupSchema),
    action_catalog: z.array(actionCatalogBackupSchema),
  })
  .superRefine((document, context) => {
    if (document.paycheck_plan.length > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only one paycheck plan can be restored.',
      })
    }
    if (document.paycheck_allocations.length > 0 && document.paycheck_plan.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Paycheck allocations need a paycheck plan.',
      })
    }
  })

export type BackupDocument = z.infer<typeof backupDocumentSchema>

export const backupCountsSchema = z.object({
  transactions: wholeNumber.nonnegative(),
  budgets: wholeNumber.nonnegative(),
  category_rules: wholeNumber.nonnegative(),
  subscriptions: wholeNumber.nonnegative(),
  subscription_charges: wholeNumber.nonnegative(),
  goals: wholeNumber.nonnegative(),
  goal_contributions: wholeNumber.nonnegative(),
  paycheck_plan: wholeNumber.nonnegative(),
  paycheck_allocations: wholeNumber.nonnegative(),
  action_feedback: wholeNumber.nonnegative(),
  action_history: wholeNumber.nonnegative(),
  action_type_bias: wholeNumber.nonnegative(),
  action_metric_weights: wholeNumber.nonnegative(),
  action_catalog: wholeNumber.nonnegative(),
})

export type BackupCounts = z.infer<typeof backupCountsSchema>

export const backupPreviewSchema = z.object({
  version: z.literal(1),
  exported_at: timestamp,
  counts: backupCountsSchema,
  warnings: z.array(z.string()),
})

export type BackupPreview = z.infer<typeof backupPreviewSchema>

export const backupRestoreSchema = z.object({
  status: z.literal('restored'),
  version: z.literal(1),
  counts: backupCountsSchema,
})

export type BackupRestoreResponse = z.infer<typeof backupRestoreSchema>

export type FullExportFormat = 'xlsx' | 'zip' | 'json'

export function isFullExportFormat(value: string): value is FullExportFormat {
  return value === 'xlsx' || value === 'zip' || value === 'json'
}

export const BACKUP_DATASET_LABELS: ReadonlyArray<{ key: keyof BackupCounts; label: string }> = [
  { key: 'transactions', label: 'Transactions' },
  { key: 'budgets', label: 'Budgets' },
  { key: 'category_rules', label: 'Category rules' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'subscription_charges', label: 'Subscription charges' },
  { key: 'goals', label: 'Goals' },
  { key: 'goal_contributions', label: 'Goal contributions' },
  { key: 'paycheck_plan', label: 'Paycheck plan' },
  { key: 'paycheck_allocations', label: 'Paycheck allocations' },
  { key: 'action_feedback', label: 'Action feedback' },
  { key: 'action_history', label: 'Action history' },
  { key: 'action_type_bias', label: 'Action type bias' },
  { key: 'action_metric_weights', label: 'Action metric weights' },
  { key: 'action_catalog', label: 'Action catalog' },
]

const apiErrorSchema = z.object({
  detail: z.union([z.string(), z.array(z.string())]),
})

export function parseBackupDocument(payload: unknown): BackupDocument {
  const parsed = backupDocumentSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('That file is not a finance backup this app can read.')
  }
  return parsed.data
}

export function parseBackupText(text: string): BackupDocument {
  try {
    return parseBackupDocument(JSON.parse(text))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('That file is not valid JSON.', { cause: error })
    }
    throw error
  }
}

export async function readApiError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json()
    const parsed = apiErrorSchema.safeParse(payload)
    if (!parsed.success) return `API error: ${response.status} ${response.statusText}`
    const { detail } = parsed.data
    return typeof detail === 'string' ? detail : detail.join(' ')
  } catch {
    return `API error: ${response.status} ${response.statusText}`
  }
}
