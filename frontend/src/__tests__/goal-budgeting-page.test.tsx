import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import GoalBudgetPlanner from '../components/GoalBudgetPlanner'

describe('goal budgeting planner', () => {
  it('renders wizard and paycheck planning sections', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { enabled: false },
      },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <GoalBudgetPlanner />
      </QueryClientProvider>
    )

    expect(html).toContain('Goal Creation Wizard')
    expect(html).toContain('Paycheck Plan')
    expect(html).toContain('Generate Recommendation')
    expect(html).toContain('Add Obligation')
  })
})
