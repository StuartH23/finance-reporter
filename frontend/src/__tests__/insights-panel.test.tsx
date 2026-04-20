import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '../api/queryKeys'
import type { InsightsResponse } from '../api/types'
import InsightsPanel from '../components/InsightsPanel'

describe('insights panel', () => {
  it('renders empty state when no insights are available', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { enabled: false },
      },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <InsightsPanel />
      </QueryClientProvider>,
    )

    expect(html).toContain('Coach Insights')
    expect(html).toContain('Upload at least two full months of data')
  })

  it('renders why/do sections when insights exist', () => {
    const queryClient = new QueryClient()

    const payload: InsightsResponse = {
      generated_at: '2026-03-22T00:00:00+00:00',
      locale: 'en-US',
      currency: 'USD',
      period_label: 'March 2026',
      suppressed: 0,
      insights: [
        {
          id: 'spending-trend',
          kind: 'spending_trend',
          title: 'Food spending rose this period',
          observation: 'Food spending increased by $120.',
          significance: 'It can crowd out savings.',
          action: 'Set a weekly cap this month.',
          why_this_matters: 'It can crowd out savings.',
          do_this_now: 'Set a weekly cap this month.',
          confidence: 0.82,
          template_key: 'spending_trend_up',
          template_vars: { category: 'Food', change_amount: 120 },
          digest: 'Food is up this month. Action: set a cap.',
          period_label: 'March 2026',
        },
      ],
      digest: [
        {
          id: 'spending-trend',
          kind: 'spending_trend',
          title: 'Food spending rose this period',
          observation: 'Food spending increased by $120.',
          significance: 'It can crowd out savings.',
          action: 'Set a weekly cap this month.',
          why_this_matters: 'It can crowd out savings.',
          do_this_now: 'Set a weekly cap this month.',
          confidence: 0.82,
          template_key: 'spending_trend_up',
          template_vars: { category: 'Food', change_amount: 120 },
          digest: 'Food is up this month. Action: set a cap.',
          period_label: 'March 2026',
        },
      ],
    }

    queryClient.setQueryData(queryKeys.insights, payload)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <InsightsPanel />
      </QueryClientProvider>,
    )

    expect(html).toContain('Coach Insights (March 2026)')
    expect(html).toContain('Why this matters')
    expect(html).toContain('Do this now')
    expect(html).toContain('Confidence 82%')
  })
})
