import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '../api/queryKeys'
import type { LedgerResponse } from '../api/types'
import TransactionList from '../components/TransactionList'
import { normalizeMerchantLabel } from '../utils/merchant'

describe('transaction list', () => {
  it('matches merchant drill-down filters for long descriptions', () => {
    const longMerchant =
      'Acme Very Long Merchant Name For Premium Annual Subscription Renewal Charge 2026'
    const queryClient = new QueryClient()
    const ledger: LedgerResponse = {
      transactions: [
        {
          date: '2026-03-04',
          description: longMerchant,
          amount: -42.5,
          category: 'Subscriptions',
          source_file: 'demo.csv',
        },
      ],
      count: 1,
    }

    queryClient.setQueryData(queryKeys.ledger, ledger)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TransactionList filters={{ merchant: normalizeMerchantLabel(longMerchant) }} />
      </QueryClientProvider>,
    )

    expect(html).toContain(longMerchant)
    expect(html).not.toContain('No transactions match the selected cash-flow segment.')
  })
})
