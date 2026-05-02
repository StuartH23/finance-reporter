import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getNextBestActionFeed } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { dashboardActionRoute, dashboardActionRouteLabel, formatMoney } from './dashboardActions'

export default function DashboardActionQueue() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: queryKeys.actions.feed,
    queryFn: getNextBestActionFeed,
  })

  const actions = data?.actions ?? []
  const [topAction, ...secondaryActions] = actions
  const route = topAction ? dashboardActionRoute(topAction) : null

  return (
    <section className="dashboard-action-queue" aria-labelledby="next-moves-title">
      <div className="dashboard-card-header">
        <div>
          <div className="dashboard-section-kicker">Recommended Next Move</div>
          <h2 id="next-moves-title">What deserves attention</h2>
        </div>
        <span>{actions.length ? `${actions.length} open` : 'Ready after review'}</span>
      </div>

      {topAction ? (
        <>
          <article className="dashboard-primary-action">
            <div className="dashboard-primary-action-copy">
              <span>Top Action</span>
              <h3>{topAction.title}</h3>
              <p>{topAction.rationale}</p>
            </div>
            <div className="dashboard-primary-action-evidence">
              <div>
                <span>Impact</span>
                <strong>
                  {topAction.impact_estimate || `${formatMoney(topAction.impact_monthly)}/mo`}
                </strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>{Math.round(topAction.score * 100)}% match</strong>
              </div>
            </div>
            {route && (
              <button type="button" className="primary-button" onClick={() => navigate(route)}>
                {dashboardActionRouteLabel(topAction)}
              </button>
            )}
          </article>

          {secondaryActions.length > 0 && (
            <ul className="dashboard-secondary-action-list" aria-label="Other recommended actions">
              {secondaryActions.slice(0, 3).map((action) => {
                const secondaryRoute = dashboardActionRoute(action)
                return (
                  <li key={action.action_id} className="dashboard-secondary-action-row">
                    <span>{action.title}</span>
                    <strong>{formatMoney(action.impact_monthly)}/mo</strong>
                    {secondaryRoute && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => navigate(secondaryRoute)}
                      >
                        Review
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      ) : (
        <p className="empty-state empty-state-compact">
          Once there is enough data, this area will show the next financial review action.
        </p>
      )}
    </section>
  )
}
