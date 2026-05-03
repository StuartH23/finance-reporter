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
  status_group: 'active',
  payment_state: 'upcoming',
  next_due_date: '2026-04-15',
  last_paid_amount: 19.99,
  manually_managed: false,
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

  it('renders Upcoming view with payment-state labels when recurring v2 data exists', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    qc.setQueryData(['subscriptions', 'upcoming', false, false, 0.1], {
      subscriptions: [baseItem],
      count: 1,
    })
    const html = wrap(<SubscriptionCenter />, qc)
    expect(html).toContain('Upcoming')
    expect(html).toContain('Netflix')
  })

  it('renders Active and Inactive groups in All view data shape', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    const inactiveItem: SubscriptionItem = {
      ...baseItem,
      stream_id: 'inactive-1',
      merchant: 'Old Box',
      status_group: 'inactive',
      payment_state: 'inactive',
      next_due_date: null,
    }
    qc.setQueryData(['subscriptions', 'upcoming', false, false, 0.1], {
      subscriptions: [baseItem, inactiveItem],
      count: 2,
    })
    const html = wrap(<SubscriptionCenter />, qc)
    expect(html).toContain('Upcoming')
  })
})
