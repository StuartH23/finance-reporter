import type { NextBestAction } from '../api/types'

export function dashboardActionRoute(action: NextBestAction): string | null {
  if (action.action_type === 'subscription_cleanup' || action.action_type === 'bill_review') {
    return '/subscriptions'
  }
  if (action.action_type === 'spending_cap') {
    return '/budget'
  }
  if (action.action_type === 'save_transfer') {
    return '/budget'
  }
  return null
}

export function dashboardActionRouteLabel(action: NextBestAction): string {
  if (action.action_type === 'subscription_cleanup' || action.action_type === 'bill_review') {
    return 'Review Subscriptions'
  }
  if (action.action_type === 'spending_cap') {
    return 'Go To Budget'
  }
  if (action.action_type === 'save_transfer') {
    return 'Plan Transfer'
  }
  return 'View Details'
}

export function formatMoney(n: number, digits = 0) {
  return `$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}
