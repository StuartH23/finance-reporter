import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getNextBestActionFeed, submitActionFeedback } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { NextBestAction } from '../api/types'
import { useGuestFeature } from '../guest/GuestFeatureProvider'

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
  const { guardGuestFeature } = useGuestFeature()
  const feedQuery = useQuery({
    queryKey: queryKeys.actions.feed,
    queryFn: getNextBestActionFeed,
  })

  const feedbackMutation = useMutation({
    mutationFn: ({
      actionId,
      outcome,
    }: {
      actionId: string
      outcome: 'completed' | 'dismissed' | 'snoozed'
    }) => submitActionFeedback(actionId, { outcome, snoozeDays: 2 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actions.feed })
    },
  })

  const actions = feedQuery.data?.actions ?? []

  const submitFeedback = (actionId: string, outcome: 'completed' | 'dismissed' | 'snoozed') => {
    if (
      guardGuestFeature({
        title: 'Sign in to save action status',
        message:
          'Guest Demo shows sample action ideas. Sign in to complete, dismiss, or snooze actions for your own account.',
      })
    ) {
      return
    }
    feedbackMutation.mutate({ actionId, outcome })
  }

  if (!feedQuery.isLoading && !feedQuery.data?.actionable_data_exists) {
    return null
  }

  return (
    <div className="card">
      <h2>Next Best Actions</h2>
      <p className="budget-hint">1-3 high-impact, low-friction actions personalized for today.</p>

      {feedQuery.isLoading && <p>Loading actions...</p>}
      {!feedQuery.isLoading && actions.length === 0 && (
        <p className="empty-state">
          No actions right now. Upload recent transactions to generate personalized actions.
        </p>
      )}

      {actions.length > 0 && (
        <div className="nba-list">
          {actions.map((action) => (
            <div className="nba-row" key={action.action_id}>
              <div className="nba-row-meta">
                <span className="nba-type">{typeLabel(action.action_type)}</span>
                <span className="nba-impact">{fmt(action.impact_monthly)}/mo</span>
              </div>
              <p className="nba-row-title">{action.title}</p>
              <div className="nba-row-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => submitFeedback(action.action_id, 'completed')}
                >
                  Done
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => submitFeedback(action.action_id, 'dismissed')}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default NextBestActionFeed
