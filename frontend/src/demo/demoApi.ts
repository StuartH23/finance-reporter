import { z } from 'zod'
import type {
  BudgetComparison,
  BudgetListResponse,
  BudgetVsActualResponse,
  CashFlowResponse,
  CategoryBreakdownResponse,
  Goal,
  InsightsResponse,
  MonthlyPnlResponse,
  NextBestAction,
  PaycheckPlanResponse,
  SavedPaycheckPlanResponse,
  SubscriptionAlertsResponse,
  SubscriptionItem,
  SubscriptionListResponse,
  SubscriptionSummary,
  YearlyPnlResponse,
} from '../api/types'
import { normalizeMerchantLabel } from '../utils/merchant'
import { getDemoMode } from './mode'

const TRANSFER_CATEGORIES = new Set([
  'Credit Card Payments',
  'Venmo Transfers',
  'Personal Transfers',
  'Investments',
])

function clone<T>(value: T): T {
  return structuredClone(value)
}

const jsonObjectSchema = z.record(z.string(), z.unknown())
const numberRecordSchema = z.record(z.string(), z.number())
const nullableStringSchema = z.union([z.string(), z.null()])
const actionOutcomeSchema = z.enum(['completed', 'dismissed', 'snoozed'])

function parseBody(options?: RequestInit): Record<string, unknown> {
  if (!options?.body || typeof options.body !== 'string') return {}
  try {
    const parsed = jsonObjectSchema.safeParse(JSON.parse(options.body))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

function readNumberRecord(value: unknown): Record<string, number> {
  const parsed = numberRecordSchema.safeParse(value)
  return parsed.success ? parsed.data : {}
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return fallback
}

function readNullableString(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback
  const parsed = nullableStringSchema.safeParse(value)
  return parsed.success ? parsed.data : fallback
}

function readOutcome(value: unknown): 'completed' | 'dismissed' | 'snoozed' {
  const parsed = actionOutcomeSchema.safeParse(value)
  return parsed.success ? parsed.data : 'dismissed'
}

function fileNameFromEntry(entry: FormDataEntryValue): string {
  if (entry instanceof File && entry.name) return entry.name
  return 'statement.csv'
}

function nowIso() {
  return new Date().toISOString()
}

function createInitialLedgerTransactions() {
  return [
    {
      date: '2026-01-01',
      description: 'Salary Payment',
      amount: 4200,
      category: 'Income',
      source_file: 'demo_jan.csv',
    },
    {
      date: '2026-01-03',
      description: 'Groceries',
      amount: -132.45,
      category: 'Groceries',
      source_file: 'demo_jan.csv',
    },
    {
      date: '2026-01-09',
      description: 'Netflix',
      amount: -15.99,
      category: 'Subscriptions',
      source_file: 'demo_jan.csv',
    },
    {
      date: '2026-01-15',
      description: 'Rent',
      amount: -1450,
      category: 'Housing',
      source_file: 'demo_jan.csv',
    },
    {
      date: '2026-01-28',
      description: 'Gas Station',
      amount: -61.2,
      category: 'Gas & Auto',
      source_file: 'demo_jan.csv',
    },
    {
      date: '2026-01-31',
      description: 'Transfer To Savings',
      amount: -250,
      category: 'Investments',
      source_file: 'demo_jan.csv',
    },

    {
      date: '2026-02-01',
      description: 'Salary Payment',
      amount: 4250,
      category: 'Income',
      source_file: 'demo_feb.csv',
    },
    {
      date: '2026-02-05',
      description: 'Groceries',
      amount: -148.1,
      category: 'Groceries',
      source_file: 'demo_feb.csv',
    },
    {
      date: '2026-02-13',
      description: 'Restaurant',
      amount: -89.6,
      category: 'Meals & Dining',
      source_file: 'demo_feb.csv',
    },
    {
      date: '2026-02-17',
      description: 'Rent',
      amount: -1450,
      category: 'Housing',
      source_file: 'demo_feb.csv',
    },
    {
      date: '2026-02-25',
      description: 'Utilities',
      amount: -104.48,
      category: 'Utilities',
      source_file: 'demo_feb.csv',
    },
    {
      date: '2026-02-28',
      description: 'Travel Deposit',
      amount: -120,
      category: 'Travel',
      source_file: 'demo_feb.csv',
    },

    {
      date: '2026-03-01',
      description: 'Salary Payment',
      amount: 4300,
      category: 'Income',
      source_file: 'demo_mar.csv',
    },
    {
      date: '2026-03-04',
      description: 'Groceries',
      amount: -152.22,
      category: 'Groceries',
      source_file: 'demo_mar.csv',
    },
    {
      date: '2026-03-11',
      description: 'Gym Membership',
      amount: -29.99,
      category: 'Subscriptions',
      source_file: 'demo_mar.csv',
    },
    {
      date: '2026-03-18',
      description: 'Rent',
      amount: -1450,
      category: 'Housing',
      source_file: 'demo_mar.csv',
    },
    {
      date: '2026-03-24',
      description: 'Car Payment',
      amount: -515,
      category: 'Car Payment',
      source_file: 'demo_mar.csv',
    },
    {
      date: '2026-03-31',
      description: 'Savings Transfer',
      amount: -300,
      category: 'Investments',
      source_file: 'demo_mar.csv',
    },
  ]
}

function createInitialState() {
  const transactions = createInitialLedgerTransactions().map((transaction, index) => ({
    id: `demo-${index + 1}`,
    ...transaction,
  }))

  const monthly: MonthlyPnlResponse = {
    months: [
      { month_str: '2026-01', income: 4200, expenses: 1909.64, net: 2290.36, profitable: true },
      { month_str: '2026-02', income: 4250, expenses: 1912.18, net: 2337.82, profitable: true },
      { month_str: '2026-03', income: 4300, expenses: 2147.21, net: 2152.79, profitable: true },
    ],
  }

  const yearly: YearlyPnlResponse = {
    years: [{ year: 2026, income: 12750, expenses: 5969.03, net: 6780.97, profitable: true }],
  }

  const categories: CategoryBreakdownResponse = {
    categories: [
      { category: 'Housing', income: 0, expenses: 4350, net: -4350, transactions: 3 },
      { category: 'Groceries', income: 0, expenses: 432.77, net: -432.77, transactions: 3 },
      { category: 'Subscriptions', income: 0, expenses: 45.98, net: -45.98, transactions: 2 },
      { category: 'Utilities', income: 0, expenses: 104.48, net: -104.48, transactions: 1 },
      { category: 'Car Payment', income: 0, expenses: 515, net: -515, transactions: 1 },
      { category: 'Meals & Dining', income: 0, expenses: 89.6, net: -89.6, transactions: 1 },
      { category: 'Travel', income: 0, expenses: 120, net: -120, transactions: 1 },
      { category: 'Income', income: 12750, expenses: 0, net: 12750, transactions: 3 },
    ],
    spending_chart: [
      { category: 'Housing', total: 4350, transactions: 3 },
      { category: 'Car Payment', total: 515, transactions: 1 },
      { category: 'Groceries', total: 432.77, transactions: 3 },
      { category: 'Travel', total: 120, transactions: 1 },
      { category: 'Utilities', total: 104.48, transactions: 1 },
      { category: 'Meals & Dining', total: 89.6, transactions: 1 },
      { category: 'Subscriptions', total: 45.98, transactions: 2 },
    ],
  }

  const insights: InsightsResponse = {
    generated_at: nowIso(),
    locale: 'en-US',
    currency: 'USD',
    period_label: 'March 2026',
    suppressed: 0,
    insights: [
      {
        id: 'cashflow-margin',
        kind: 'cashflow_risk',
        title: 'Healthy monthly margin with room to accelerate savings',
        observation: 'Net cash flow stayed above $2,100 for 3 straight months.',
        significance: 'Consistency makes automation safer and easier.',
        action: 'Schedule a recurring transfer right after payday.',
        why_this_matters: 'Consistent margin is the best predictor of savings follow-through.',
        do_this_now:
          'Increase your automatic transfer by $100 this month and review after 30 days.',
        confidence: 0.84,
        template_key: 'cashflow_margin',
        template_vars: { margin: 2152.79 },
        digest: 'Cash flow is stable. Increase automated savings by $100.',
        period_label: 'March 2026',
      },
      {
        id: 'category-housing',
        kind: 'spending_trend',
        title: 'Housing remains your largest spend category',
        observation: 'Housing accounts for more than half of total monthly spend.',
        significance: 'Small wins in adjacent categories can still boost overall savings quickly.',
        action: 'Trim one discretionary category by 10% to offset fixed housing costs.',
        why_this_matters:
          'Fixed costs are harder to change, so variable categories drive flexibility.',
        do_this_now: 'Set a Dining cap 10% lower for the next 4 weeks.',
        confidence: 0.79,
        template_key: 'housing_weight',
        template_vars: { pct: 57 },
        digest: 'Housing dominates spend. Adjust one variable category this month.',
        period_label: 'March 2026',
      },
    ],
    digest: [],
  }
  insights.digest = insights.insights

  const budget: BudgetListResponse = {
    budget: [
      { category: 'Income', monthly_budget: 0 },
      { category: 'Groceries', monthly_budget: 550 },
      { category: 'Meals & Dining', monthly_budget: 120 },
      { category: 'Medical', monthly_budget: 200 },
      { category: 'Housing', monthly_budget: 1450 },
      { category: 'Subscriptions', monthly_budget: 50 },
      { category: 'Shopping', monthly_budget: 150 },
      { category: 'Donations', monthly_budget: 50 },
      { category: 'Entertainment', monthly_budget: 120 },
      { category: 'Car Payment', monthly_budget: 515 },
      { category: 'Gas & Auto', monthly_budget: 180 },
      { category: 'Recreation', monthly_budget: 90 },
      { category: 'Travel', monthly_budget: 100 },
      { category: 'Utilities', monthly_budget: 140 },
      { category: 'Government Fees', monthly_budget: 50 },
    ],
  }

  const goals: Goal[] = [
    {
      id: 'goal-1',
      name: 'Emergency Fund',
      target_amount: 6000,
      target_date: '2026-12-31',
      priority: 1,
      category: 'emergency',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: nowIso(),
      contributed_amount: 2200,
      remaining_amount: 3800,
      progress_pct: 36.6,
      contribution_history: [
        { month: '2026-01', amount: 700 },
        { month: '2026-02', amount: 700 },
        { month: '2026-03', amount: 800 },
      ],
    },
    {
      id: 'goal-2',
      name: 'Vacation',
      target_amount: 2400,
      target_date: '2026-09-01',
      priority: 3,
      category: 'vacation',
      status: 'active',
      created_at: '2026-01-15T00:00:00Z',
      updated_at: nowIso(),
      contributed_amount: 850,
      remaining_amount: 1550,
      progress_pct: 35.4,
      contribution_history: [
        { month: '2026-01', amount: 250 },
        { month: '2026-02', amount: 300 },
        { month: '2026-03', amount: 300 },
      ],
    },
  ]

  const subscriptions: SubscriptionItem[] = [
    {
      stream_id: 'sub-1',
      merchant: 'Netflix',
      dominant_category: 'Subscriptions',
      cadence: 'monthly',
      confidence: 0.93,
      active: true,
      ignored: false,
      essential: false,
      amount: 15.99,
      baseline_amount: 14.99,
      expected_amount: 15.99,
      next_expected_charge_date: '2026-04-09',
      next_due_date: '2026-04-09',
      last_charge_date: '2026-03-09',
      last_paid_amount: 15.99,
      trend: 'up',
      price_increase: true,
      charge_count: 6,
      charge_history: [
        { date: '2025-10-09', amount: 14.99 },
        { date: '2025-11-09', amount: 14.99 },
        { date: '2025-12-09', amount: 15.49 },
        { date: '2026-01-09', amount: 15.99 },
        { date: '2026-02-09', amount: 15.99 },
        { date: '2026-03-09', amount: 15.99 },
      ],
      cancellation_candidate: true,
      negotiation_opportunity: false,
      is_new_recurring: false,
      missed_expected_charge: false,
      status_group: 'active',
      payment_state: 'upcoming',
      manually_managed: false,
    },
    {
      stream_id: 'sub-2',
      merchant: 'Gym Membership',
      dominant_category: 'Recreation',
      cadence: 'monthly',
      confidence: 0.9,
      active: true,
      ignored: false,
      essential: true,
      amount: 29.99,
      baseline_amount: 29.99,
      expected_amount: 29.99,
      next_expected_charge_date: '2026-04-11',
      next_due_date: '2026-04-11',
      last_charge_date: '2026-03-11',
      last_paid_amount: 29.99,
      trend: 'flat',
      price_increase: false,
      charge_count: 5,
      charge_history: [
        { date: '2025-11-11', amount: 29.99 },
        { date: '2025-12-11', amount: 29.99 },
        { date: '2026-01-11', amount: 29.99 },
        { date: '2026-02-11', amount: 29.99 },
        { date: '2026-03-11', amount: 29.99 },
      ],
      cancellation_candidate: false,
      negotiation_opportunity: false,
      is_new_recurring: false,
      missed_expected_charge: false,
      status_group: 'active',
      payment_state: 'paid_ok',
      manually_managed: false,
    },
  ]

  const actions: NextBestAction[] = [
    {
      action_id: 'demo-action-1',
      action_type: 'subscription_cleanup',
      title: 'Review two overlapping streaming services',
      rationale: 'You have optional subscriptions with similar usage patterns.',
      impact_estimate: 'Potentially save $16 to $30 monthly.',
      impact_monthly: 22,
      score: 0.84,
      state: 'suggested',
    },
    {
      action_id: 'demo-action-2',
      action_type: 'save_transfer',
      title: 'Increase automatic savings transfer by $100',
      rationale: 'Your monthly net is stable and can support a higher transfer.',
      impact_estimate: 'Adds roughly $1,200/year to savings.',
      impact_monthly: 100,
      score: 0.81,
      state: 'suggested',
    },
    {
      action_id: 'demo-action-3',
      action_type: 'spending_cap',
      title: 'Set a dining cap for the next 30 days',
      rationale: 'Dining has risen compared with your monthly baseline.',
      impact_estimate: 'Target a $40 monthly reduction.',
      impact_monthly: 40,
      score: 0.72,
      state: 'suggested',
    },
  ]

  const savedPlan: SavedPaycheckPlanResponse = {
    status: 'ok',
    plan: {
      paycheck_amount: 2000,
      needs: 1150,
      goals: 450,
      discretionary: 250,
      safety_buffer_reserved: 150,
      mode: 'balanced',
    },
  }

  return {
    transactions,
    monthly,
    yearly,
    categories,
    insights,
    budget,
    goals,
    subscriptions,
    actions,
    savedPlan,
  }
}

type DemoState = ReturnType<typeof createInitialState>
let demoState: DemoState = createInitialState()

export function resetDemoState() {
  demoState = createInitialState()
}

export function getDemoTransactions() {
  return demoState.transactions
}

export function getDemoLedgerCsv(): string {
  const csvEscape = (s: string) => `"${s.replaceAll('"', '""')}"`
  const header = 'date,description,amount,category,source_file'
  const rows = demoState.transactions.map(
    (tx) =>
      `${tx.date},${csvEscape(tx.description)},${tx.amount},${csvEscape(tx.category)},${csvEscape(tx.source_file)}`,
  )
  return [header, ...rows].join('\n')
}

function buildBudgetVsActual(): BudgetVsActualResponse {
  const avgByCategory: Record<string, number> = {}

  for (const tx of demoState.transactions) {
    if (tx.amount >= 0) continue
    if (TRANSFER_CATEGORIES.has(tx.category)) continue
    avgByCategory[tx.category] = (avgByCategory[tx.category] ?? 0) + Math.abs(tx.amount)
  }

  const comparison: BudgetComparison[] = demoState.budget.budget.map((item) => {
    const avgActual = Math.round((avgByCategory[item.category] ?? 0) / 3)
    const diff = item.monthly_budget - avgActual
    const pctUsed =
      item.monthly_budget > 0 ? Math.round((avgActual / item.monthly_budget) * 1000) / 10 : 0
    return {
      category: item.category,
      monthly_budget: item.monthly_budget,
      avg_actual: avgActual,
      total_actual: avgActual * 3,
      diff,
      pct_used: pctUsed,
    }
  })

  const monthlyBudget = comparison.reduce((sum, row) => sum + row.monthly_budget, 0)
  const avgMonthlySpending = comparison.reduce((sum, row) => sum + row.avg_actual, 0)

  return {
    comparison,
    summary: {
      monthly_budget: monthlyBudget,
      avg_monthly_spending: avgMonthlySpending,
      surplus_deficit: monthlyBudget - avgMonthlySpending,
      months_of_data: 3,
    },
  }
}

function buildTransfers() {
  const transfers = demoState.transactions.filter((tx) => TRANSFER_CATEGORIES.has(tx.category))
  const summaryMap = new Map<string, { category: string; total: number; transactions: number }>()

  for (const tx of transfers) {
    const existing = summaryMap.get(tx.category)
    if (existing) {
      existing.total += Math.abs(tx.amount)
      existing.transactions += 1
    } else {
      summaryMap.set(tx.category, {
        category: tx.category,
        total: Math.abs(tx.amount),
        transactions: 1,
      })
    }
  }

  return {
    transactions: clone(transfers),
    count: transfers.length,
    summary: Array.from(summaryMap.values()),
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function periodSortValue(periodKey: string, granularity: 'month' | 'quarter') {
  if (granularity === 'month') return periodKey
  const [yearStr, quarterStr] = periodKey.split('-Q')
  return `${yearStr}-${quarterStr}`
}

function periodLabel(periodKey: string, granularity: 'month' | 'quarter') {
  if (granularity === 'month') {
    const parsed = new Date(`${periodKey}-01T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return periodKey
    return parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  const [yearStr, quarterStr] = periodKey.split('-Q')
  return `Q${quarterStr} ${yearStr}`
}

function buildDemoCashFlow(searchParams: URLSearchParams): CashFlowResponse {
  const granularity = (searchParams.get('granularity') === 'quarter' ? 'quarter' : 'month') as
    | 'month'
    | 'quarter'
  const groupBy = (searchParams.get('group_by') === 'merchant' ? 'merchant' : 'category') as
    | 'category'
    | 'merchant'
  const period = searchParams.get('period')

  const transactions = demoState.transactions.filter((tx) => !TRANSFER_CATEGORIES.has(tx.category))
  if (!transactions.length) {
    return {
      granularity,
      group_by: groupBy,
      period_key: period,
      period_label: period ? periodLabel(period, granularity) : null,
      available_periods: [],
      totals: { income: 0, expenses: 0, net: 0 },
      nodes: [],
      links: [],
      groups: [],
      transaction_count: 0,
    }
  }

  const withPeriod = transactions.map((tx) => {
    const date = new Date(`${tx.date}T00:00:00`)
    const periodKey =
      granularity === 'month'
        ? tx.date.slice(0, 7)
        : `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
    return { ...tx, periodKey }
  })

  const availablePeriodKeys = [...new Set(withPeriod.map((tx) => tx.periodKey))].sort((a, b) => {
    const left = periodSortValue(a, granularity)
    const right = periodSortValue(b, granularity)
    return left < right ? 1 : -1
  })

  const selectedPeriod = period ?? availablePeriodKeys[0] ?? null
  const periodRows = selectedPeriod
    ? withPeriod.filter((tx) => tx.periodKey === selectedPeriod)
    : []
  if (!selectedPeriod || !periodRows.length) {
    return {
      granularity,
      group_by: groupBy,
      period_key: selectedPeriod,
      period_label: selectedPeriod ? periodLabel(selectedPeriod, granularity) : null,
      available_periods: availablePeriodKeys.map((key) => ({
        key,
        label: periodLabel(key, granularity),
      })),
      totals: { income: 0, expenses: 0, net: 0 },
      nodes: [],
      links: [],
      groups: [],
      transaction_count: 0,
    }
  }

  const income = roundMoney(
    periodRows.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0),
  )
  const expenseRows = periodRows.filter((tx) => tx.amount < 0)

  const grouped = new Map<string, { amount: number; transactions: number }>()
  for (const tx of expenseRows) {
    const key = groupBy === 'category' ? tx.category : normalizeMerchantLabel(tx.description)
    const current = grouped.get(key)
    if (current) {
      current.amount += Math.abs(tx.amount)
      current.transactions += 1
    } else {
      grouped.set(key, { amount: Math.abs(tx.amount), transactions: 1 })
    }
  }

  const groups = Array.from(grouped.entries())
    .map(([key, value]) => ({
      key,
      label: key,
      amount: roundMoney(value.amount),
      transactions: value.transactions,
    }))
    .sort((a, b) => b.amount - a.amount)

  const expenses = roundMoney(groups.reduce((sum, group) => sum + group.amount, 0))
  const net = roundMoney(income - expenses)
  const savings = roundMoney(Math.max(0, net))
  const shortfall = roundMoney(Math.max(0, -net))

  const nodes: CashFlowResponse['nodes'] = [
    { id: 'income', label: 'Income', type: 'income', value: income, group_key: null },
  ]
  const links: CashFlowResponse['links'] = []
  const shortfallLinks: CashFlowResponse['links'] = []

  const ratio = expenses > 0 ? Math.min(1, income / expenses) : 1
  for (const [index, group] of groups.entries()) {
    const nodeId = `expense-${index + 1}`
    nodes.push({
      id: nodeId,
      label: group.label,
      type: 'expense',
      value: group.amount,
      group_key: group.key,
    })
    const incomeShare = roundMoney(group.amount * ratio)
    if (incomeShare > 0) {
      links.push({ source: 'income', target: nodeId, value: incomeShare })
    }
    const missingShare = roundMoney(group.amount - incomeShare)
    if (missingShare > 0) {
      shortfallLinks.push({ source: 'shortfall', target: nodeId, value: missingShare })
    }
  }

  if (savings > 0) {
    nodes.push({
      id: 'savings',
      label: 'Savings',
      type: 'savings',
      value: savings,
      group_key: null,
    })
    links.push({ source: 'income', target: 'savings', value: savings })
  }
  if (shortfall > 0) {
    nodes.push({
      id: 'shortfall',
      label: 'Shortfall',
      type: 'shortfall',
      value: shortfall,
      group_key: null,
    })
    links.push(...shortfallLinks)
  }

  return {
    granularity,
    group_by: groupBy,
    period_key: selectedPeriod,
    period_label: periodLabel(selectedPeriod, granularity),
    available_periods: availablePeriodKeys.map((key) => ({
      key,
      label: periodLabel(key, granularity),
    })),
    totals: {
      income,
      expenses,
      net,
    },
    nodes,
    links,
    groups,
    transaction_count: periodRows.length,
  }
}

const SUBSCRIPTION_MONTHLY_FACTOR: Record<string, number> = {
  weekly: 52 / 12,
  monthly: 1,
  annual: 1 / 12,
}

function buildSubscriptionSummary(subscriptions: SubscriptionItem[]): SubscriptionSummary {
  const eligible = subscriptions.filter((sub) => !sub.ignored)
  const active = eligible.filter((sub) => sub.active)
  const monthlyRunRate = active.reduce(
    (sum, sub) => sum + sub.amount * (SUBSCRIPTION_MONTHLY_FACTOR[sub.cadence] ?? 1),
    0,
  )

  let referenceDate: Date | null = null
  for (const sub of eligible) {
    for (const charge of sub.charge_history) {
      const chargeDate = new Date(`${charge.date}T00:00:00`)
      if (Number.isNaN(chargeDate.getTime())) continue
      if (!referenceDate || chargeDate > referenceDate) {
        referenceDate = chargeDate
      }
    }
  }
  referenceDate ??= new Date()

  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const latestMonthLabel = `${year}-${String(month + 1).padStart(2, '0')}`
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
  const latestMonthIsComplete = referenceDate.getDate() === lastDayOfMonth

  const latestMonthTotal = eligible.reduce(
    (sum, sub) =>
      sum +
      sub.charge_history.reduce((chargeSum, charge) => {
        const chargeDate = new Date(`${charge.date}T00:00:00`)
        if (Number.isNaN(chargeDate.getTime())) return chargeSum
        if (chargeDate.getFullYear() !== year || chargeDate.getMonth() !== month) {
          return chargeSum
        }
        return chargeSum + charge.amount
      }, 0),
    0,
  )

  return {
    monthly_run_rate: Math.round(monthlyRunRate * 100) / 100,
    annual_run_rate: Math.round(monthlyRunRate * 12 * 100) / 100,
    active_count: active.length,
    latest_month_total: Math.round(latestMonthTotal * 100) / 100,
    latest_month_label: latestMonthLabel,
    latest_month_is_complete: latestMonthIsComplete,
  }
}

function buildSubscriptionsList(searchParams: URLSearchParams): SubscriptionListResponse {
  const status = searchParams.get('status') ?? 'active'
  const view = searchParams.get('view') ?? 'all'
  const statusGroup = searchParams.get('status_group')
  const month = searchParams.get('month')
  const sort = searchParams.get('sort') ?? 'priority'
  const filterIncreased = searchParams.get('filter_increased') === 'true'
  const filterOptional = searchParams.get('filter_optional') === 'true'
  const threshold = Number.parseFloat(searchParams.get('threshold') ?? '0')

  let subscriptions = demoState.subscriptions.filter((sub) => sub.active)

  if (status === 'ignored') {
    subscriptions = demoState.subscriptions.filter((sub) => sub.ignored)
  } else if (status === 'all') {
    subscriptions = demoState.subscriptions
  }

  if (filterIncreased) {
    subscriptions = subscriptions.filter((sub) => {
      if (sub.baseline_amount <= 0) return false
      return (sub.amount - sub.baseline_amount) / sub.baseline_amount >= (threshold || 0)
    })
  }

  if (filterOptional) {
    subscriptions = subscriptions.filter((sub) => !sub.essential)
  }

  if (view === 'upcoming') {
    subscriptions = subscriptions.filter(
      (sub) => sub.status_group === 'active' && sub.next_due_date,
    )
  }

  if (statusGroup === 'active' || statusGroup === 'inactive') {
    subscriptions = subscriptions.filter((sub) => sub.status_group === statusGroup)
  }

  if (month) {
    subscriptions = subscriptions.filter((sub) => sub.next_due_date?.startsWith(month))
  }

  if (sort === 'due_asc') {
    subscriptions = subscriptions
      .slice()
      .sort((a, b) => (a.next_due_date ?? '').localeCompare(b.next_due_date ?? ''))
  } else if (sort === 'due_desc') {
    subscriptions = subscriptions
      .slice()
      .sort((a, b) => (b.next_due_date ?? '').localeCompare(a.next_due_date ?? ''))
  } else if (sort === 'amount_desc') {
    subscriptions = subscriptions.slice().sort((a, b) => b.amount - a.amount)
  }

  return {
    subscriptions: clone(subscriptions),
    count: subscriptions.length,
    summary: buildSubscriptionSummary(demoState.subscriptions),
  }
}

function buildSubscriptionAlerts(searchParams: URLSearchParams): SubscriptionAlertsResponse {
  const threshold = Number.parseFloat(searchParams.get('threshold') ?? '0.1')
  const alerts = demoState.subscriptions
    .filter(
      (sub) =>
        sub.baseline_amount > 0 &&
        (sub.amount - sub.baseline_amount) / sub.baseline_amount >= threshold,
    )
    .map((sub) => ({
      stream_id: sub.stream_id,
      merchant: sub.merchant,
      alert_type: 'price_increase',
      message: `${sub.merchant} increased from $${sub.baseline_amount.toFixed(2)} to $${sub.amount.toFixed(2)}.`,
    }))

  return { alerts, count: alerts.length }
}

function buildPaycheckPlan(): PaycheckPlanResponse {
  return {
    paycheck_amount: 2000,
    allocation_mode: 'balanced',
    fixed_obligations_total: 1120,
    needs: 1120,
    goals: 480,
    discretionary: 250,
    safety_buffer_reserved: 150,
    goal_allocations: demoState.goals
      .filter((goal) => goal.status === 'active')
      .map((goal) => ({
        goal_id: goal.id,
        name: goal.name,
        category: goal.category,
        priority: goal.priority,
        target_date: goal.target_date,
        recommended_amount: goal.id === 'goal-1' ? 300 : 180,
        remaining_after_allocation: Math.max(
          0,
          goal.remaining_amount - (goal.id === 'goal-1' ? 300 : 180),
        ),
        required_per_paycheck: goal.id === 'goal-1' ? 240 : 120,
        feasible: true,
      })),
    warnings: [],
    explanations: [
      'Needs are funded first from fixed obligations.',
      'Goal allocation favors higher-priority goals.',
    ],
    what_changed: [
      'Added a larger emergency-fund contribution based on your current margin.',
      'Kept a fixed safety buffer before discretionary allocation.',
    ],
  }
}

function feedActions(): NextBestAction[] {
  return demoState.actions.filter((action) => action.state === 'suggested').slice(0, 3)
}

function guestReadOnlyMessage(pathname: string) {
  if (pathname === '/upload') {
    return 'Guest demo is read-only. Sign in to upload personal statements.'
  }
  return 'Guest demo is read-only. Sign in to save changes.'
}

function guestWriteBlocked(method: string, pathname: string) {
  return method !== 'GET' && !(method === 'POST' && pathname === '/goals/paycheck-plan')
}

type DemoContext = {
  url: URL
  pathname: string
  options?: RequestInit | undefined
}

type DemoRoute = {
  method: string
  match: (pathname: string) => boolean
  respond: (ctx: DemoContext) => unknown
}

function demoRoutes(): DemoRoute[] {
  return [
    {
      method: 'GET',
      match: (pathname) => pathname === '/ledger',
      respond: () => ({
        transactions: clone(demoState.transactions),
        count: demoState.transactions.length,
      }),
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/ledger/transfers',
      respond: () => buildTransfers(),
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/pnl/monthly',
      respond: () => clone(demoState.monthly),
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/pnl/yearly',
      respond: () => clone(demoState.yearly),
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/pnl/categories',
      respond: () => clone(demoState.categories),
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/cashflow',
      respond: ({ url }) => buildDemoCashFlow(url.searchParams),
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/insights',
      respond: () => clone(demoState.insights),
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/budget',
      respond: () => clone(demoState.budget),
    },
    {
      method: 'PUT',
      match: (pathname) => pathname === '/budget',
      respond: ({ options }) => {
        const parsed = parseBody(options)
        const budgetInput = readNumberRecord(parsed.budget)
        demoState.budget.budget = demoState.budget.budget.map((item) => ({
          ...item,
          monthly_budget: Math.max(
            0,
            Math.round(budgetInput[item.category] ?? item.monthly_budget),
          ),
        }))
        return {
          status: 'ok',
          categories: demoState.budget.budget.length,
        }
      },
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/budget/vs-actual',
      respond: () => buildBudgetVsActual(),
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/goals',
      respond: () => ({
        goals: clone(demoState.goals),
        count: demoState.goals.length,
      }),
    },
    {
      method: 'POST',
      match: (pathname) => pathname === '/goals',
      respond: ({ options }) => {
        const parsed = parseBody(options)
        const targetAmount = readNumber(parsed.target_amount, 1000)
        const goal: Goal = {
          id: `goal-${Math.floor(Math.random() * 100000)}`,
          name: readString(parsed.name, 'New Goal'),
          target_amount: targetAmount,
          target_date: readNullableString(parsed.target_date, null),
          priority: readNumber(parsed.priority, 3),
          category: readString(parsed.category, 'savings'),
          status: readString(parsed.status, 'active'),
          created_at: nowIso(),
          updated_at: nowIso(),
          contributed_amount: 0,
          remaining_amount: targetAmount,
          progress_pct: 0,
          contribution_history: [],
        }
        demoState.goals = [goal, ...demoState.goals]
        return { status: 'ok', goal: clone(goal) }
      },
    },
    {
      method: 'PUT',
      match: (pathname) => pathname.startsWith('/goals/'),
      respond: ({ pathname, options }) => {
        const goalId = pathname.split('/')[2] ?? ''
        const parsed = parseBody(options)
        const idx = demoState.goals.findIndex((goal) => goal.id === goalId)
        const existing = idx >= 0 ? demoState.goals[idx] : undefined
        if (!existing) return null
        const targetAmount = readNumber(parsed.target_amount, existing.target_amount)
        const contributed = existing.contributed_amount
        const updated: Goal = {
          ...existing,
          name: readString(parsed.name, existing.name),
          target_amount: targetAmount,
          target_date: readNullableString(parsed.target_date, existing.target_date),
          priority: readNumber(parsed.priority, existing.priority),
          category: readString(parsed.category, existing.category),
          status: readString(parsed.status, existing.status),
          updated_at: nowIso(),
          remaining_amount: Math.max(0, targetAmount - contributed),
          progress_pct: targetAmount > 0 ? Math.min(100, (contributed / targetAmount) * 100) : 0,
        }
        demoState.goals[idx] = updated
        return { status: 'ok', goal: clone(updated) }
      },
    },
    {
      method: 'POST',
      match: (pathname) => pathname === '/goals/paycheck-plan',
      respond: () => buildPaycheckPlan(),
    },
    {
      method: 'POST',
      match: (pathname) => pathname === '/goals/paycheck-plan/save',
      respond: ({ options }) => {
        const parsed = parseBody(options)
        demoState.savedPlan = { status: 'ok', plan: parsed }
        return { status: 'ok', plan: clone(parsed) }
      },
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/goals/paycheck-plan/saved',
      respond: () => clone(demoState.savedPlan),
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/subscriptions',
      respond: ({ url }) => buildSubscriptionsList(url.searchParams),
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/subscriptions/alerts',
      respond: ({ url }) => buildSubscriptionAlerts(url.searchParams),
    },
    {
      method: 'POST',
      match: (pathname) => pathname.endsWith('/preferences'),
      respond: ({ pathname, options }) => {
        const streamId = pathname.split('/')[2] ?? ''
        const parsed = parseBody(options)
        const idx = demoState.subscriptions.findIndex((sub) => sub.stream_id === streamId)
        const current = idx >= 0 ? demoState.subscriptions[idx] : undefined
        if (!current) return null
        const updated: SubscriptionItem = {
          ...current,
          essential: typeof parsed.essential === 'boolean' ? parsed.essential : current.essential,
          ignored: typeof parsed.ignored === 'boolean' ? parsed.ignored : current.ignored,
        }
        demoState.subscriptions[idx] = updated
        return {
          status: 'ok',
          stream_id: streamId,
          essential: updated.essential,
          ignored: updated.ignored,
        }
      },
    },
    {
      method: 'GET',
      match: (pathname) => pathname.endsWith('/cancel-info'),
      respond: ({ pathname }) => {
        const streamId = pathname.split('/')[2] ?? ''
        const sub = demoState.subscriptions.find((item) => item.stream_id === streamId)
        if (!sub) {
          throw new Error('API error: 404 Not Found')
        }
        if (sub.merchant.toUpperCase().includes('NETFLIX')) {
          return {
            stream_id: streamId,
            merchant: sub.merchant,
            found: true,
            display_name: 'Netflix',
            cancel_url: 'https://www.netflix.com/cancelplan',
            support_url: 'https://help.netflix.com/contactus',
            phone: null,
            notes: null,
          }
        }
        return {
          stream_id: streamId,
          merchant: sub.merchant,
          found: false,
        }
      },
    },
    {
      method: 'POST',
      match: (pathname) => pathname.endsWith('/review'),
      respond: ({ pathname }) => {
        const streamId = pathname.split('/')[2] ?? ''
        const sub = demoState.subscriptions.find((item) => item.stream_id === streamId)
        if (!sub) throw new Error('API error: 404 Not Found')
        if (!sub.price_increase && !sub.is_new_recurring) {
          throw new Error('API error: 409 Conflict')
        }
        return {
          stream_id: streamId,
          verdict: sub.price_increase ? 'price_concern' : 'review_needed',
          reason: sub.price_increase
            ? `${sub.merchant} is above its previous baseline, so it is worth confirming the change.`
            : `${sub.merchant} has only a short recurring history, so it is worth reviewing once.`,
          evidence: sub.charge_history
            .slice(-3)
            .map((charge) => `${charge.date}: $${charge.amount.toFixed(2)}`),
          cached: false,
        }
      },
    },
    {
      method: 'GET',
      match: (pathname) => pathname === '/actions/feed',
      respond: () => {
        const actions = feedActions()
        return {
          feed_date: nowIso().slice(0, 10),
          count: actions.length,
          actionable_data_exists: true,
          actions: clone(actions),
        }
      },
    },
    {
      method: 'POST',
      match: (pathname) => pathname.startsWith('/actions/') && pathname.endsWith('/feedback'),
      respond: ({ pathname, options }) => {
        const actionId = pathname.split('/')[2] ?? ''
        const parsed = parseBody(options)
        const outcome = readOutcome(parsed.outcome)
        demoState.actions = demoState.actions.map((action) =>
          action.action_id === actionId ? { ...action, state: outcome } : action,
        )
        return {
          status: 'ok',
          action_id: actionId,
          outcome,
          ...(outcome === 'snoozed'
            ? { snooze_until: new Date(Date.now() + 2 * 86400000).toISOString() }
            : {}),
        }
      },
    },
    {
      method: 'POST',
      match: (pathname) => pathname === '/upload',
      respond: ({ options }) => {
        const files =
          options?.body instanceof FormData
            ? options.body.getAll('files').map((entry) => fileNameFromEntry(entry))
            : []
        const listedFiles = files.length ? files : ['demo_statement.csv']
        return {
          files: listedFiles.map((file) => ({ file, status: 'ok', transactions: 6 })),
          total_transactions: listedFiles.length * 6,
          pnl_transactions: listedFiles.length * 5,
          transfer_transactions: listedFiles.length,
        }
      },
    },
  ]
}

export function getDemoResponse(path: string, options?: RequestInit): unknown | null {
  if (!getDemoMode()) return null

  const url = new URL(path, 'http://demo.local')
  const method = (options?.method ?? 'GET').toUpperCase()
  const pathname = url.pathname

  if (guestWriteBlocked(method, pathname)) {
    throw new Error(guestReadOnlyMessage(pathname))
  }

  const route = demoRoutes().find((entry) => entry.method === method && entry.match(pathname))
  if (!route) return null
  return route.respond({ url, pathname, options })
}
