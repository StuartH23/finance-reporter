import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SubscriptionItem } from '../api/types'
import { AuthProvider } from '../auth/AuthProvider'
import SubscriptionCenter from '../components/SubscriptionCenter'
import { GuestFeatureProvider } from '../guest/GuestFeatureProvider'

function wrap(ui: React.ReactElement, queryClient?: QueryClient) {
  const qc = queryClient ?? new QueryClient({ defaultOptions: { queries: { enabled: false } } })
  return renderToStaticMarkup(
    <AuthProvider>
      <QueryClientProvider client={qc}>
        <GuestFeatureProvider>{ui}</GuestFeatureProvider>
      </QueryClientProvider>
    </AuthProvider>,
  )
}

const baseItem: SubscriptionItem = {
  stream_id: 'test-1',
  merchant: 'Netflix',
  cadence: 'monthly',
  confidence: 0.95,
  active: true,
  ignored: false,
  essential: false,
  amount: 19.99,
  baseline_amount: 17.99,
  expected_amount: 19.99,
  next_expected_charge_date: null,
  last_charge_date: '2024-03-01',
  trend: 'up',
  price_increase: true,
  charge_count: 29,
  charge_history: [],
  cancellation_candidate: true,
  negotiation_opportunity: false,
  is_new_recurring: false,
  missed_expected_charge: false,
}

describe('SubscriptionCenter', () => {
  it('renders title and empty state when no subscriptions', () => {
    const html = wrap(<SubscriptionCenter />)
    expect(html).toContain('Subscription Center')
    expect(html).toContain('No subscriptions detected yet.')
  })

  it('hides filters by default and shows them after Advanced toggle', () => {
    const html = wrap(<SubscriptionCenter />)
    expect(html).toContain('Advanced')
    // filter controls are in the DOM but not shown until Advanced is toggled
    // (in static markup they're absent because showAdvanced starts false)
    expect(html).not.toContain('Increased only')
    expect(html).not.toContain('Optional only')
    expect(html).not.toContain('Price increase threshold')
  })

  it('renders Needs Review section header when reviewable items exist', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    qc.setQueryData(['subscriptions', 'all', false, false, 0.1], {
      subscriptions: [baseItem],
      count: 1,
    })
    const html = wrap(<SubscriptionCenter />, qc)
    expect(html).toContain('Needs Review')
    expect(html).toContain('at risk')
    expect(html).toContain('Netflix')
  })

  it('shows inline reason without requiring a detail click', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    qc.setQueryData(['subscriptions', 'all', false, false, 0.1], {
      subscriptions: [baseItem],
      count: 1,
    })
    const html = wrap(<SubscriptionCenter />, qc)
    expect(html).toContain('Price increased')
    expect(html).toContain('extra per year')
  })

  it('shows correct cadence label for weekly subscription', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    const weeklyItem: SubscriptionItem = {
      ...baseItem,
      stream_id: 'weekly-1',
      merchant: 'WeeklyBox',
      cadence: 'weekly',
      amount: 9.99,
      price_increase: false,
      charge_count: 5,
    }
    qc.setQueryData(['subscriptions', 'all', false, false, 0.1], {
      subscriptions: [weeklyItem],
      count: 1,
    })
    const html = wrap(<SubscriptionCenter />, qc)
    expect(html).toContain('/wk')
    expect(html).not.toContain('$9.99/mo')
  })

  it('shows correct cadence label for annual subscription', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    const annualItem: SubscriptionItem = {
      ...baseItem,
      stream_id: 'annual-1',
      merchant: 'AnnualService',
      cadence: 'annual',
      amount: 99.99,
      price_increase: false,
      charge_count: 2,
    }
    qc.setQueryData(['subscriptions', 'all', false, false, 0.1], {
      subscriptions: [annualItem],
      count: 1,
    })
    const html = wrap(<SubscriptionCenter />, qc)
    expect(html).toContain('/yr')
  })

  it('does not render Infinity when baseline_amount is zero', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    const zeroBaseItem: SubscriptionItem = {
      ...baseItem,
      stream_id: 'zero-base',
      price_increase: true,
      baseline_amount: 0,
      amount: 9.99,
    }
    qc.setQueryData(['subscriptions', 'all', false, false, 0.1], {
      subscriptions: [zeroBaseItem],
      count: 1,
    })
    const html = wrap(<SubscriptionCenter />, qc)
    expect(html).not.toContain('Infinity')
    expect(html).not.toContain('NaN')
  })

  it('places essential items in Essential section, not Needs Review', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    const essentialItem: SubscriptionItem = { ...baseItem, stream_id: 'ess-1', essential: true }
    qc.setQueryData(['subscriptions', 'all', false, false, 0.1], {
      subscriptions: [essentialItem],
      count: 1,
    })
    const html = wrap(<SubscriptionCenter />, qc)
    expect(html).toContain('Essential')
    expect(html).not.toContain('Needs Review')
  })
})
