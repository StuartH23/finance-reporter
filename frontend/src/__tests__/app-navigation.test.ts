import { describe, expect, it } from 'vitest'
import { getNavGroups, getNavItems } from '../appNavigation'

describe('app navigation', () => {
  it('groups review and plan routes while keeping Ask AI ungrouped', () => {
    const groups = getNavGroups()

    expect(groups).toEqual([
      {
        label: 'Review',
        items: [
          { to: '/', label: 'Money Checkup', icon: 'dashboard' },
          { to: '/cash-flow', label: 'Cash Flow', icon: 'cashflow' },
          { to: '/subscriptions', label: 'Subscriptions', icon: 'subscriptions' },
        ],
      },
      {
        label: 'Plan',
        items: [
          { to: '/budget', label: 'Budget', icon: 'budget' },
          { to: '/goals', label: 'Goals', icon: 'goals' },
        ],
      },
      {
        label: null,
        items: [{ to: '/chat', label: 'Ask AI', icon: 'chat' }],
      },
    ])
  })

  it('keeps mobile navigation flat in grouped order', () => {
    expect(getNavItems().map((item) => item.label)).toEqual([
      'Money Checkup',
      'Cash Flow',
      'Subscriptions',
      'Budget',
      'Goals',
      'Ask AI',
    ])
  })
})
