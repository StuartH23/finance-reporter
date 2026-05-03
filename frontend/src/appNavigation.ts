export type AppNavItem = {
  to: string
  label: string
  icon: 'dashboard' | 'cashflow' | 'budget' | 'goals' | 'subscriptions' | 'chat'
}

const baseNavItems: AppNavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/cash-flow', label: 'Cash Flow', icon: 'cashflow' },
  { to: '/budget', label: 'Budget', icon: 'budget' },
  { to: '/chat', label: 'Ask AI', icon: 'chat' },
]

export function getNavItems(): AppNavItem[] {
  return [
    ...baseNavItems.slice(0, 3),
    { to: '/goals', label: 'Goals', icon: 'goals' },
    { to: '/subscriptions', label: 'Subscriptions', icon: 'subscriptions' },
    ...baseNavItems.slice(3),
  ]
}
