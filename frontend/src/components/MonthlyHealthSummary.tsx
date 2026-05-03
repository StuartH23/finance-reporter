import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getNextBestActionFeed } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { MonthlyPnl, MonthlyPnlResponse, NextBestAction } from '../api/types'
import { dashboardActionRoute, dashboardActionRouteLabel, formatMoney } from './dashboardActions'

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

function signedMoney(n: number) {
  const sign = n >= 0 ? '+' : '-'
  return `${sign}${formatMoney(n)}`
}

function spendingMovement(latest?: MonthlyPnl, previous?: MonthlyPnl) {
  if (!latest || !previous) return 'Spending trend will appear after another month of data.'

  const delta = latest.expenses - previous.expenses
  if (Math.abs(delta) < 1) return 'Spending was flat vs last month.'

  const direction = delta > 0 ? 'up' : 'down'
  return `Spending was ${direction} ${formatMoney(delta)} vs last month.`
}

function healthTone(latest?: MonthlyPnl, topAction?: NextBestAction | null) {
  if (!latest) return 'Review ready'
  if (latest.net < 0) return 'Needs attention'
  if (topAction && topAction.score >= 0.75) return 'Worth a quick review'
  return 'On track'
}

export default function MonthlyHealthSummary({
  monthlyData,
}: {
  monthlyData?: MonthlyPnlResponse
}) {
  const navigate = useNavigate()
  const feedQuery = useQuery({
    queryKey: queryKeys.actions.feed,
    queryFn: getNextBestActionFeed,
  })

  const months = sortedMonths(monthlyData?.months ?? [])
  const latest = months.at(-1)
  const previous = months.at(-2)
  const topAction = feedQuery.data?.actions[0] ?? null
  const route = topAction ? dashboardActionRoute(topAction) : null

  if (!latest && !topAction && !feedQuery.isLoading) return null

  return (
    <section className="monthly-health-summary" aria-labelledby="monthly-health-title">
      <div className="monthly-health-main">
        <span className="monthly-health-status">{healthTone(latest, topAction)}</span>
        <h2 id="monthly-health-title">
          {latest
            ? `${latest.month_str} ended ${signedMoney(latest.net)}`
            : 'Your monthly checkup is ready'}
        </h2>
        <p>{spendingMovement(latest, previous)}</p>
      </div>

      <div className="monthly-health-action">
        <span>Start Here</span>
        <strong>
          {topAction ? 'Highest-impact review' : 'Review this month when new actions are ready.'}
        </strong>
        {topAction && <p>{topAction.rationale}</p>}
        {topAction && route && (
          <button type="button" className="primary-button" onClick={() => navigate(route)}>
            {dashboardActionRouteLabel(topAction)}
          </button>
        )}
      </div>
    </section>
  )
}
