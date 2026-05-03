import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '../api/queryKeys'
import type { LedgerResponse } from '../api/types'
import TransactionList from '../components/TransactionList'

describe('transaction list', () => {
  it('renders server-filtered period rows', () => {
    const longMerchant =
      'Acme Very Long Merchant Name For Premium Annual Subscription Renewal Charge 2026'
    const queryClient = new QueryClient()
    const ledger: LedgerResponse = {
      transactions: [
        {
          id: 'tx-1',
          date: '2026-03-04',
          description: longMerchant,
          amount: -42.5,
          category: 'Subscriptions',
          source_file: 'demo.csv',
        },
      ],
      count: 1,
    }

    queryClient.setQueryData(
      queryKeys.ledgerTransactions({
        granularity: 'month',
        period: '2026-03',
        sort: 'date',
        direction: 'asc',
      }),
      ledger,
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TransactionList granularity="month" period="2026-03" periodLabel="March 2026" />
      </QueryClientProvider>,
    )

    expect(html).toContain(longMerchant)
    expect(html).toContain('March 2026 Transactions (1)')
  })
})
