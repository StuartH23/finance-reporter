export type AppNavItem = {
  to: string
  label: string
  icon: 'dashboard' | 'cashflow' | 'budget' | 'goals' | 'subscriptions' | 'chat' | 'export'
}

export type AppNavGroup = {
  label: string | null
  items: AppNavItem[]
}

const navGroups: AppNavGroup[] = [
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
  {
    label: 'Data',
    items: [{ to: '/export', label: 'Export', icon: 'export' }],
  },
]

export function getNavGroups(): AppNavGroup[] {
  return navGroups
}

export function getNavItems(): AppNavItem[] {
  return navGroups.flatMap((group) => group.items)
}
