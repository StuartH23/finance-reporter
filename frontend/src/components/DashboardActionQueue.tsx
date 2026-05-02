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

  return (
    <section className="card dashboard-action-queue" aria-labelledby="next-moves-title">
      <div className="dashboard-card-header">
        <div>
          <div className="dashboard-section-kicker">What Can I Do Next</div>
          <h2 id="next-moves-title">Action Queue</h2>
        </div>
        <span>{actions.length ? `${actions.length} open` : 'Ready after review'}</span>
      </div>

      {actions.length ? (
        <div className="dashboard-action-list">
          {actions.slice(0, 4).map((action, index) => {
            const route = dashboardActionRoute(action)
            return (
              <article key={action.action_id} className="dashboard-action-row">
                <span className="dashboard-action-rank">{index + 1}</span>
                <div>
                  <h3>{action.title}</h3>
                  <p>{action.rationale}</p>
                </div>
                <strong>{formatMoney(action.impact_monthly)}/mo</strong>
                {route && (
                  <button type="button" className="ghost-button" onClick={() => navigate(route)}>
                    {dashboardActionRouteLabel(action)}
                  </button>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <p className="empty-state empty-state-compact">
          Once there is enough data, this queue will show the next financial review actions.
        </p>
      )}
    </section>
  )
}
