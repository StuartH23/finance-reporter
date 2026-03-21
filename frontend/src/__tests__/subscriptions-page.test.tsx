import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import SubscriptionCenter from '../components/SubscriptionCenter'

describe('subscription center', () => {
  it('renders controls and empty state', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { enabled: false },
      },
    })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SubscriptionCenter />
      </QueryClientProvider>
    )

    expect(html).toContain('Subscription Center')
    expect(html).toContain('Increased only')
    expect(html).toContain('Optional only')
    expect(html).toContain('Price increase threshold')
    expect(html).toContain('No subscriptions detected yet.')
  })
})
