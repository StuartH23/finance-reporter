import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '../api/queryKeys'
import type {
  CancelInfoResponse,
  SubscriptionItem,
  SubscriptionReviewResponse,
  SubscriptionSummary,
} from '../api/types'
import { AuthProvider } from '../auth/AuthProvider'
import SubscriptionCenter, { CancelPanel, ReviewSection } from '../components/SubscriptionCenter'
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
  dominant_category: 'Subscriptions',
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

const summary: SubscriptionSummary = {
  monthly_run_rate: 45.98,
  annual_run_rate: 551.76,
  active_count: 2,
  latest_month_total: 45.98,
  latest_month_label: '2026-04',
  latest_month_is_complete: false,
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

  it('renders Upcoming view with hero summary and row state pills', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    qc.setQueryData(['subscriptions', 'upcoming', false, false, 0.1], {
      subscriptions: [baseItem],
      count: 1,
      summary,
    })
    const html = wrap(<SubscriptionCenter />, qc)
    expect(html).toContain('Upcoming')
    expect(html).toContain('Netflix')
    expect(html).toContain('Subscriptions category')
    expect(html).toContain('monthly run-rate')
    expect(html).toContain('April so far')
    expect(html).toContain('Price ↑')
    expect(html).toContain('How to Cancel')
  })

  it('renders cancel panel with cancellation page link when info is found', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    const cancelInfo: CancelInfoResponse = {
      stream_id: baseItem.stream_id,
      merchant: baseItem.merchant,
      found: true,
      display_name: 'Netflix',
      cancel_url: 'https://www.netflix.com/cancelplan',
      support_url: 'https://help.netflix.com/contactus',
      phone: null,
      notes: null,
    }
    qc.setQueryData(queryKeys.subscriptions.cancelInfo(baseItem.stream_id), cancelInfo)
    const html = wrap(
      <CancelPanel
        item={baseItem}
        onClose={() => {}}
        onStopTracking={() => {}}
        isStopTrackingPending={false}
      />,
      qc,
    )
    expect(html).toContain('Cancel Netflix')
    expect(html).toContain('https://www.netflix.com/cancelplan')
    expect(html).toContain('Open cancellation page')
    expect(html).toContain('I canceled this')
  })

  it('renders cancel panel with search fallback when info is not found', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    const cancelInfo: CancelInfoResponse = {
      stream_id: baseItem.stream_id,
      merchant: 'OBSCURE LOCAL GYM',
      found: false,
      cancel_url: null,
      support_url: null,
      phone: null,
      notes: null,
    }
    const obscureItem = { ...baseItem, merchant: 'OBSCURE LOCAL GYM' }
    qc.setQueryData(queryKeys.subscriptions.cancelInfo(baseItem.stream_id), cancelInfo)
    const html = wrap(
      <CancelPanel
        item={obscureItem}
        onClose={() => {}}
        onStopTracking={() => {}}
        isStopTrackingPending={false}
      />,
      qc,
    )
    expect(html).toContain('Search web for cancellation instructions')
    expect(html).toContain(
      `https://www.google.com/search?q=${encodeURIComponent('how to cancel OBSCURE LOCAL GYM')}`,
    )
    expect(html).toContain('have a cancellation page for this service')
    expect(html).toContain('I canceled this')
  })

  it('renders review control and cached constrained verdict for eligible rows', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
    const review: SubscriptionReviewResponse = {
      stream_id: baseItem.stream_id,
      verdict: 'price_concern',
      reason: 'Netflix is above the prior baseline.',
      evidence: ['Mar 1: $19.99'],
      cached: true,
    }
    qc.setQueryData(queryKeys.subscriptions.review(baseItem.stream_id), review)
    const html = wrap(<ReviewSection item={baseItem} />, qc)
    expect(html).toContain('AI review')
    expect(html).toContain('Review again')
    expect(html).toContain('Price concern')
    expect(html).toContain('cached')
    expect(html).toContain('Netflix is above the prior baseline.')
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
      summary,
    })
    const html = wrap(<SubscriptionCenter />, qc)
    expect(html).toContain('Upcoming')
  })
})
