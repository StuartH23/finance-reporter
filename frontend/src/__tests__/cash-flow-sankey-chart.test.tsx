import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '../api/queryKeys'
import type { CashFlowResponse } from '../api/types'
import CashFlowSankeyChart from '../components/CashFlowSankeyChart'

describe('cash flow sankey chart', () => {
  it('renders empty state without data', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { enabled: false },
      },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <CashFlowSankeyChart />
      </QueryClientProvider>,
    )

    expect(html).toContain('Cash Flow Map')
    expect(html).toContain('Upload transactions to visualize')
  })

  it('renders latest month summary when data exists', () => {
    const queryClient = new QueryClient()

    const cashFlow: CashFlowResponse = {
      granularity: 'month',
      group_by: 'category',
      period_key: '2026-03',
      period_label: 'March 2026',
      available_periods: [{ key: '2026-03', label: 'March 2026' }],
      totals: { income: 4200, expenses: 2800, net: 1400 },
      nodes: [
        { id: 'income', label: 'Income', type: 'income', value: 4200, group_key: null },
        { id: 'expense-1', label: 'Housing', type: 'expense', value: 1600, group_key: 'Housing' },
        {
          id: 'expense-2',
          label: 'Groceries',
          type: 'expense',
          value: 1200,
          group_key: 'Groceries',
        },
        { id: 'savings', label: 'Savings', type: 'savings', value: 1400, group_key: null },
      ],
      links: [
        { source: 'income', target: 'expense-1', value: 1600 },
        { source: 'income', target: 'expense-2', value: 1200 },
        { source: 'income', target: 'savings', value: 1400 },
      ],
      groups: [
        { key: 'Housing', label: 'Housing', amount: 1600, transactions: 4 },
        { key: 'Groceries', label: 'Groceries', amount: 1200, transactions: 8 },
      ],
      transaction_count: 12,
    }

    queryClient.setQueryData(
      queryKeys.cashflow.byParams({ granularity: 'month', groupBy: 'category', period: undefined }),
      cashFlow,
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <CashFlowSankeyChart />
      </QueryClientProvider>,
    )

    expect(html).toContain('Cash Flow Map')
    expect(html).toContain('March 2026')
    expect(html).toContain('$4,200.00')
    expect(html).toContain('$2,800.00')
    expect(html).toContain('$1,400.00')
  })
})
