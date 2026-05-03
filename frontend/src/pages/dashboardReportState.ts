export type DashboardReport = 'pnl' | 'transactions'

export function normalizeDashboardReport(value: string | null | undefined): DashboardReport {
  return value === 'transactions' ? 'transactions' : 'pnl'
}
