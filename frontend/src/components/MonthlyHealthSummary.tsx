import type { MonthlyPnl, MonthlyPnlResponse } from '../api/types'
import { formatSignedMoney } from '../utils/signedMoney'
import { formatMoney } from './dashboardActions'

function toMonthDate(monthStr: string) {
  const parsed = new Date(`${monthStr} 1`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function sortedMonths(months: MonthlyPnl[]) {
  return [...months].sort((a, b) => {
    const da = toMonthDate(a.month_str)
    const db = toMonthDate(b.month_str)
    if (!da || !db) return 0
    return da.getTime() - db.getTime()
  })
}

function spendingMovement(latest?: MonthlyPnl, previous?: MonthlyPnl) {
  if (!latest || !previous) return 'Spending trend will appear after another month of data.'

  const delta = latest.expenses - previous.expenses
  if (Math.abs(delta) < 1) return 'Spending was flat vs last month.'

  const direction = delta > 0 ? 'up' : 'down'
  return `Spending was ${direction} ${formatMoney(delta)} vs last month.`
}

function healthTone(latest?: MonthlyPnl) {
  if (!latest) return 'Review ready'
  if (latest.net < 0) return 'Needs attention'
  return 'On track'
}

export default function MonthlyHealthSummary({
  monthlyData,
}: {
  monthlyData?: MonthlyPnlResponse
}) {
  const months = sortedMonths(monthlyData?.months ?? [])
  const latest = months.at(-1)
  const previous = months.at(-2)

  if (!latest) return null

  return (
    <section className="monthly-health-summary" aria-labelledby="monthly-health-title">
      <div className="monthly-health-main">
        <span className="badge badge--accent monthly-health-status">{healthTone(latest)}</span>
        <h2 id="monthly-health-title">
          {latest
            ? `${latest.month_str} ended ${formatSignedMoney(latest.net)}`
            : 'Your monthly checkup is ready'}
        </h2>
        <p>{spendingMovement(latest, previous)}</p>
      </div>
    </section>
  )
}
