import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getInsights, getNextBestActionFeed } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { dashboardActionRoute, dashboardActionRouteLabel, formatMoney } from './dashboardActions'

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

export default function DashboardAttentionRail() {
  const navigate = useNavigate()
  const feedQuery = useQuery({
    queryKey: queryKeys.actions.feed,
    queryFn: getNextBestActionFeed,
  })
  const insightsQuery = useQuery({
    queryKey: queryKeys.insights,
    queryFn: () => getInsights({ locale: 'en-US', currency: 'USD' }),
  })

  const topAction = feedQuery.data?.actions[0] ?? null
  const supportingInsight = insightsQuery.data?.insights[0] ?? null
  const route = topAction ? dashboardActionRoute(topAction) : null

  return (
    <section className="card dashboard-attention-card" aria-labelledby="attention-title">
      <div className="dashboard-section-kicker">What Deserves Attention</div>
      <h2 id="attention-title">Priority Review</h2>

      {topAction ? (
        <>
          <div className="attention-priority-row">
            <span className="attention-badge">Top Action</span>
            <span className="attention-score">Score {Math.round(topAction.score * 100)}</span>
          </div>
          <h3>{topAction.title}</h3>
          <p>{topAction.rationale}</p>
          <div className="attention-impact-grid">
            <div>
              <span>Impact</span>
              <strong>
                {topAction.impact_estimate || `${formatMoney(topAction.impact_monthly)}/mo`}
              </strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{topAction.state}</strong>
            </div>
          </div>
          {route && (
            <button
              type="button"
              className="primary-button attention-cta"
              onClick={() => navigate(route)}
            >
              {dashboardActionRouteLabel(topAction)}
            </button>
          )}
        </>
      ) : (
        <p className="budget-hint">
          Upload statements or use demo data to generate a prioritized financial review.
        </p>
      )}

      {supportingInsight && (
        <div className="attention-insight">
          <span>Supporting Insight</span>
          <strong>{supportingInsight.title}</strong>
          <p>{supportingInsight.observation}</p>
          <small>Confidence {pct(supportingInsight.confidence)}</small>
        </div>
      )}
    </section>
  )
}
