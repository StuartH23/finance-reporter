import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { GuestFeatureProvider } from '../guest/GuestFeatureProvider'
import Dashboard from '../pages/Dashboard'
import { normalizeDashboardReport } from '../pages/dashboardReportState'

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { enabled: false } } })
}

function renderDashboard({
  client = queryClient(),
  canEnableDemo = false,
  demoModeEnabled = false,
  initialEntry = '/',
}: {
  client?: QueryClient
  canEnableDemo?: boolean
  demoModeEnabled?: boolean
  initialEntry?: string
} = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <QueryClientProvider client={client}>
          <GuestFeatureProvider>
            <Dashboard
              canEnableDemo={canEnableDemo}
              demoModeEnabled={demoModeEnabled}
              onEnableDemoMode={() => {}}
            />
          </GuestFeatureProvider>
        </QueryClientProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function seedDashboardData(client: QueryClient) {
  client.setQueryData(['ledger'], {
    count: 2,
    transactions: [
      {
        date: '2026-03-01',
        description: 'Payroll',
        amount: 5000,
        category: 'Income',
        source_file: 'march.csv',
      },
      {
        date: '2026-03-02',
        description: 'Netflix',
        amount: -19.99,
        category: 'Subscriptions',
        source_file: 'march.csv',
      },
    ],
  })
  client.setQueryData(['pnl', 'monthly'], {
    months: [
      { month_str: 'February 2026', income: 4800, expenses: 3100, net: 1700, profitable: true },
      { month_str: 'March 2026', income: 5000, expenses: 3300, net: 1700, profitable: true },
    ],
  })
  client.setQueryData(['pnl', 'categories'], {
    categories: [],
    spending_chart: [{ category: 'Subscriptions', total: 19.99, transactions: 1, percentage: 1 }],
  })
  client.setQueryData(['actions', 'feed'], {
    feed_date: '2026-03-31',
    count: 2,
    actionable_data_exists: true,
    actions: [
      {
        action_id: 'subscription-cleanup',
        action_type: 'subscription_cleanup',
        title: 'Review optional subscriptions',
        rationale: 'Recurring services changed this month.',
        impact_estimate: '$20/mo',
        impact_monthly: 20,
        score: 0.82,
        state: 'suggested',
      },
      {
        action_id: 'spending-cap',
        action_type: 'spending_cap',
        title: 'Set a restaurant spending cap',
        rationale: 'Dining spend is trending above your usual range.',
        impact_estimate: '$120/mo',
        impact_monthly: 120,
        score: 0.7,
        state: 'suggested',
      },
    ],
  })
  client.setQueryData(['insights'], {
    generated_at: '2026-03-31T00:00:00Z',
    locale: 'en-US',
    currency: 'USD',
    period_label: 'March 2026',
    suppressed: 0,
    digest: [],
    insights: [
      {
        id: 'spend-change',
        kind: 'spending_trend',
        title: 'Subscriptions increased',
        observation: 'Subscription spend moved up this month.',
        significance: 'medium',
        action: 'Review recurring charges',
        why_this_matters: 'Recurring charges compound over time.',
        do_this_now: 'Review optional subscriptions.',
        confidence: 0.8,
        template_key: 'subscription_change',
        template_vars: {},
        digest: 'Subscription spend moved up.',
      },
    ],
  })
}

describe('Dashboard page', () => {
  it('renders demo-first money checkup preview when there are no transactions', () => {
    const html = renderDashboard({ canEnableDemo: true })

    expect(html).toContain('Preview Maya&#x27;s Money Checkup')
    expect(html).toContain('what changed')
    expect(html).toContain('what deserves attention')
    expect(html).toContain('what action to take next')
    expect(html).toContain('Try Demo Mode')
  })

  it('renders the monthly health dashboard when data exists', () => {
    const client = queryClient()
    seedDashboardData(client)

    const html = renderDashboard({ client, demoModeEnabled: true })

    expect(html).toContain('Money Checkup')
    expect(html).toContain('March 2026')
    expect(html).toContain('Demo')
    expect(html).toContain('2 transactions')
    expect(html).toContain('1 source')
    expect(html).toContain('Upload')
    expect(html).toContain('March 2026 ended +$1,700')
    expect(html).toContain('Income')
    expect(html).toContain('Spending')
    expect(html).toContain('Net Savings')
    expect(html).not.toContain('Largest Category')
    expect(html).toContain('What deserves attention')
    expect(html).toContain('Review optional subscriptions')
    expect(html.match(/Review optional subscriptions/g)).toHaveLength(1)
    expect(html).toContain('Set a restaurant spending cap')
    expect(html).toContain('Other recommended actions')
    expect(html).not.toContain('Priority Review')
    expect(html).not.toContain('Dashboard View')
    expect(html).not.toContain('Statement Upload')
    expect(html).toContain('Monthly P&amp;L')
    expect(html).toContain('Transactions')
    expect(html).not.toContain('All Transactions')
  })

  it('defaults invalid report search params to pnl', () => {
    expect(normalizeDashboardReport('bad-value')).toBe('pnl')
    expect(normalizeDashboardReport(null)).toBe('pnl')
    expect(normalizeDashboardReport('transactions')).toBe('transactions')
  })

  it('honors the transactions report search param', () => {
    const client = queryClient()
    seedDashboardData(client)

    const html = renderDashboard({
      client,
      demoModeEnabled: true,
      initialEntry: '/?report=transactions',
    })

    expect(html).toContain('Transactions')
    expect(html).not.toContain('Monthly P&amp;L')
  })
})
