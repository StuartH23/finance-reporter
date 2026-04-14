import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '../api/queryKeys'
import type { CategoryBreakdownResponse } from '../api/types'
import SpendingPieChart from '../components/SpendingPieChart'

describe('spending pie chart', () => {
  it('renders other breakdown list only for rolled-up categories', () => {
    const queryClient = new QueryClient()

    const categoryBreakdown: CategoryBreakdownResponse = {
      categories: [],
      spending_chart: [
        { category: 'Housing', total: 440, transactions: 2 },
        { category: 'Groceries', total: 180, transactions: 5 },
        { category: 'Car Payment', total: 150, transactions: 1 },
        { category: 'Medical', total: 80, transactions: 1 },
        { category: 'Utilities', total: 40, transactions: 3 },
        { category: 'Subscriptions', total: 30, transactions: 2 },
        { category: 'Meals & Dining', total: 20, transactions: 2 },
        { category: 'Coffee Shops', total: 5, transactions: 3 },
        { category: 'Parking Meters', total: 5, transactions: 4 },
      ],
    }

    queryClient.setQueryData(queryKeys.pnl.categoriesByYear(undefined), categoryBreakdown)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SpendingPieChart showBreakdownTable={false} />
      </QueryClientProvider>,
    )

    expect(html).toContain('Spending Profile')
    expect(html).toContain('recharts-responsive-container')
    expect(html).toContain('Total Spend')
    expect(html).toContain('$950.00')
    expect(html).toContain('Housing 46%')
    expect(html).toContain('Top 3 concentration')
    expect(html).toContain('81%')
    expect(html).toContain('3 grouped into Other')
    expect(html).toContain('spending-legend-share')
    expect(html).toContain('Other includes')
    expect(html).toContain('$30.00')
    expect(html).toContain('Meals &amp; Dining')
    expect(html).toContain('Coffee Shops')
    expect(html).toContain('Parking Meters')
    expect(html).toContain('$5.00')
    expect(html).toContain('1%')

    expect(html.indexOf('Housing')).toBeLessThan(html.indexOf('Groceries'))
    expect(html.indexOf('Groceries')).toBeLessThan(html.indexOf('Car Payment'))
    expect(html).toContain('aria-label="Spending category shares"')
  })

  it('renders nothing when there is no spending chart data', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { enabled: false },
      },
    })

    queryClient.setQueryData(queryKeys.pnl.categoriesByYear(undefined), {
      categories: [],
      spending_chart: [],
    } satisfies CategoryBreakdownResponse)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SpendingPieChart showBreakdownTable={false} />
      </QueryClientProvider>,
    )

    expect(html).toBe('')
  })

  it('renders a year-scoped title when year is provided', () => {
    const queryClient = new QueryClient()

    queryClient.setQueryData(queryKeys.pnl.categoriesByYear(2025), {
      categories: [],
      spending_chart: [{ category: 'Housing', total: 700, transactions: 2 }],
    } satisfies CategoryBreakdownResponse)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SpendingPieChart showBreakdownTable={false} year={2025} />
      </QueryClientProvider>,
    )

    expect(html).toContain('Spending Profile (2025)')
    expect(html).toContain('$700.00')
  })
})
