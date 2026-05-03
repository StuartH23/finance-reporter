import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '../api/queryKeys'
import type { CashFlowResponse, LedgerResponse, SubscriptionListResponse } from '../api/types'
import CashFlow from '../pages/CashFlow'

const currentCashFlow: CashFlowResponse = {
  granularity: 'month',
  group_by: 'category',
  period_key: '2026-03',
  period_label: 'March 2026',
  available_periods: [
    { key: '2026-03', label: 'March 2026' },
    { key: '2026-02', label: 'February 2026' },
  ],
  totals: { income: 5000, expenses: 3200, net: 1800, transfers: 600 },
  nodes: [
    { id: 'income', label: 'Income', type: 'income', value: 5000, group_key: null },
    { id: 'expense-1', label: 'Housing', type: 'expense', value: 1800, group_key: 'Housing' },
    { id: 'expense-2', label: 'Groceries', type: 'expense', value: 900, group_key: 'Groceries' },
    { id: 'savings', label: 'Savings', type: 'savings', value: 1800, group_key: null },
  ],
  links: [
    { source: 'income', target: 'expense-1', value: 1800 },
    { source: 'income', target: 'expense-2', value: 900 },
    { source: 'income', target: 'savings', value: 1800 },
  ],
  groups: [
    { key: 'Housing', label: 'Housing', amount: 1800, transactions: 2 },
    { key: 'Groceries', label: 'Groceries', amount: 900, transactions: 6 },
  ],
  transaction_count: 11,
}

const previousCashFlow: CashFlowResponse = {
  ...currentCashFlow,
  period_key: '2026-02',
  period_label: 'February 2026',
  totals: { income: 4800, expenses: 3000, net: 1800, transfers: 500 },
  groups: [
    { key: 'Housing', label: 'Housing', amount: 1700, transactions: 2 },
    { key: 'Groceries', label: 'Groceries', amount: 700, transactions: 5 },
  ],
  transaction_count: 9,
}

const ledger: LedgerResponse = {
  transactions: [
    {
      date: '2026-03-01',
      description: 'Payroll',
      amount: 5000,
      category: 'Income',
      source_file: 'demo.csv',
    },
    {
      date: '2026-03-03',
      description: 'Rent',
      amount: -1800,
      category: 'Housing',
      source_file: 'demo.csv',
    },
  ],
  count: 2,
}

const subscriptions: SubscriptionListResponse = {
  subscriptions: [
    {
      stream_id: 'sub-1',
      merchant: 'Netflix',
      dominant_category: 'Subscriptions',
      cadence: 'monthly',
      confidence: 0.95,
      active: true,
      ignored: false,
      essential: false,
      amount: 19.99,
      baseline_amount: 17.99,
      expected_amount: 19.99,
      next_expected_charge_date: '2026-04-15',
      last_charge_date: '2026-03-15',
      trend: 'up',
      price_increase: true,
      charge_count: 8,
      charge_history: [],
      cancellation_candidate: true,
      negotiation_opportunity: false,
      is_new_recurring: false,
      missed_expected_charge: false,
      status_group: 'active',
      payment_state: 'upcoming',
      next_due_date: '2026-04-15',
      last_paid_amount: 19.99,
      manually_managed: false,
    },
  ],
  count: 1,
  summary: {
    monthly_run_rate: 19.99,
    annual_run_rate: 239.88,
    active_count: 1,
    latest_month_total: 19.99,
    latest_month_label: '2026-03',
    latest_month_is_complete: true,
  },
}

describe('CashFlow page', () => {
  it('renders synchronized command-center summaries from cached report data', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    queryClient.setQueryData(
      queryKeys.cashflow.byParams({ granularity: 'month', groupBy: 'category' }),
      currentCashFlow,
    )
    queryClient.setQueryData(
      queryKeys.cashflow.byParams({
        granularity: 'month',
        groupBy: 'category',
        period: '2026-02',
      }),
      previousCashFlow,
    )
    queryClient.setQueryData(
      queryKeys.subscriptions.upcoming({ statusGroup: 'active', limit: 5 }),
      subscriptions,
    )
    queryClient.setQueryData(queryKeys.ledger, ledger)

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <CashFlow />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(html).toContain('Net cash flow')
    expect(html).toContain('Savings rate')
    expect(html).toContain('Transfers')
    expect(html).toContain('Transactions')
    expect(html).toContain('Where Cash Went')
    expect(html).toContain('Housing')
    expect(html).toContain('Groceries')
    expect(html).toContain('Detected Recurring Charges')
    expect(html).toContain('Netflix')
    expect(html).toContain('2026-04-15')
  })
})
