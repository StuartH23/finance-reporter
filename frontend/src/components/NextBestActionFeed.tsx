import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getNextBestActionFeed, submitActionFeedback } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { NextBestAction } from '../api/types'

function fmt(amount: number) {
  return `$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function typeLabel(type: NextBestAction['action_type']) {
  switch (type) {
    case 'save_transfer':
      return 'Save'
    case 'spending_cap':
      return 'Spending'
    case 'bill_review':
      return 'Bill'
    case 'debt_extra_payment':
      return 'Debt'
    case 'subscription_cleanup':
      return 'Subscriptions'
    default:
      return 'Action'
  }
}

function NextBestActionFeed() {
  const queryClient = useQueryClient()
  const feedQuery = useQuery({
    queryKey: queryKeys.actions.feed,
    queryFn: getNextBestActionFeed,
  })

  const feedbackMutation = useMutation({
    mutationFn: ({ actionId, outcome }: { actionId: string; outcome: 'completed' | 'dismissed' | 'snoozed' }) =>
      submitActionFeedback(actionId, { outcome, snoozeDays: 2 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.feed })
    },
  })

  const actions = feedQuery.data?.actions ?? []

  if (!feedQuery.isLoading && !feedQuery.data?.actionable_data_exists) {
    return null
  }

  return (
    <div className="card">
      <h2>Next Best Actions</h2>
      <p className="budget-hint">1-3 high-impact, low-friction actions personalized for today.</p>

      {feedQuery.isLoading && <p>Loading actions...</p>}
      {!feedQuery.isLoading && actions.length === 0 && (
        <p className="empty-state">No actions right now. Upload recent transactions to generate personalized actions.</p>
      )}

      {actions.length > 0 && (
        <div className="nba-grid">
          {actions.map((action) => (
            <article className="nba-card" key={action.action_id}>
              <div className="nba-header">
                <span className="nba-type">{typeLabel(action.action_type)}</span>
                <span className="nba-impact">{fmt(action.impact_monthly)}/mo</span>
              </div>
              <h3>{action.title}</h3>
              <p>{action.rationale}</p>
              <p className="budget-hint">{action.impact_estimate}</p>
              <div className="nba-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => feedbackMutation.mutate({ actionId: action.action_id, outcome: 'completed' })}
                >
                  Complete
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => feedbackMutation.mutate({ actionId: action.action_id, outcome: 'dismissed' })}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => feedbackMutation.mutate({ actionId: action.action_id, outcome: 'snoozed' })}
                >
                  Snooze
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export default NextBestActionFeed
