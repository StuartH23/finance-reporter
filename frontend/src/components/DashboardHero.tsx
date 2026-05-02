import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getMonthlyPnl, getNextBestActionFeed } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { NextBestAction } from '../api/types'

function toMonthDate(monthStr: string) {
  const parsed = new Date(`${monthStr} 1`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function fmtAmount(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function actionRoute(action: NextBestAction): string | null {
  if (action.action_type === 'subscription_cleanup' || action.action_type === 'bill_review') {
    return '/subscriptions'
  }
  if (action.action_type === 'spending_cap') {
    return '/budget'
  }
  return null
}

function actionRouteLabel(action: NextBestAction): string {
  if (action.action_type === 'subscription_cleanup' || action.action_type === 'bill_review') {
    return 'Review Subscriptions →'
  }
  if (action.action_type === 'spending_cap') {
    return 'Go to Budget →'
  }
  return 'View Details →'
}

function buildVerdictSentence(
  latestNet: number | null,
  spendingDelta: number | null,
  topAction: NextBestAction | null,
): string {
  if (latestNet !== null && spendingDelta !== null && Math.abs(spendingDelta) >= 20) {
    const direction = spendingDelta < 0 ? 'less' : 'more'
    const deltaAmt = fmtAmount(Math.abs(spendingDelta))
    if (topAction) {
      const actionSentence = topAction.title.toLowerCase().startsWith('cancel')
        ? `Top action: ${topAction.title}.`
        : 'Top action below.'
      return `You spent ${deltaAmt} ${direction} than last month. ${actionSentence}`
    }
    return `You spent ${deltaAmt} ${direction} than last month.`
  }
  if (latestNet !== null && latestNet > 0) {
    if (topAction)
      return `Net positive this month — ${fmtAmount(latestNet)} saved. Top action below.`
    return `Net positive this month — ${fmtAmount(latestNet)} saved.`
  }
  if (topAction) {
    return 'Your latest financial picture is ready. Start with the action below.'
  }
  return 'Your latest financial picture is ready.'
}

export default function DashboardHero() {
  const navigate = useNavigate()

  const pnlQuery = useQuery({
    queryKey: queryKeys.pnl.monthly,
    queryFn: getMonthlyPnl,
  })

  const feedQuery = useQuery({
    queryKey: queryKeys.actions.feed,
    queryFn: getNextBestActionFeed,
  })

  const sortedMonths = [...(pnlQuery.data?.months ?? [])].sort((a, b) => {
    const da = toMonthDate(a.month_str)
    const db = toMonthDate(b.month_str)
    if (!da || !db) return 0
    return da.getTime() - db.getTime()
  })

  const latest = sortedMonths[sortedMonths.length - 1] ?? null
  const previous = sortedMonths[sortedMonths.length - 2] ?? null
  const spendingDelta = latest && previous ? latest.expenses - previous.expenses : null

  const actions = feedQuery.data?.actions ?? []
  const [heroAction, ...secondaryActions] = actions
  const secondary = secondaryActions.slice(0, 2)

  const hasData = latest !== null || actions.length > 0
  if (!hasData && !pnlQuery.isLoading && !feedQuery.isLoading) return null

  const verdict = buildVerdictSentence(latest?.net ?? null, spendingDelta, heroAction ?? null)
  const heroRoute = heroAction ? actionRoute(heroAction) : null

  return (
    <div className="dashboard-hero">
      {(latest || heroAction) && <p className="dashboard-verdict">{verdict}</p>}

      {heroAction && (
        <div className="dashboard-top-action">
          <div className="dashboard-top-action-label">Top Action</div>
          <h3 className="dashboard-top-action-title">{heroAction.title}</h3>
          <p className="dashboard-top-action-rationale">{heroAction.rationale}</p>
          {heroAction.impact_estimate && (
            <p className="dashboard-top-action-impact">{heroAction.impact_estimate}</p>
          )}
          {heroRoute && (
            <button
              type="button"
              className="primary-button dashboard-top-action-cta"
              onClick={() => navigate(heroRoute)}
            >
              {actionRouteLabel(heroAction)}
            </button>
          )}
        </div>
      )}

      {secondary.length > 0 && (
        <ul className="dashboard-secondary-actions">
          {secondary.map((action) => {
            const route = actionRoute(action)
            return (
              <li key={action.action_id} className="dashboard-secondary-action">
                <span>{action.title}</span>
                <span className="dashboard-secondary-impact">
                  {fmtAmount(action.impact_monthly)}/mo
                </span>
                {route && (
                  <button type="button" className="ghost-button" onClick={() => navigate(route)}>
                    Review
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
