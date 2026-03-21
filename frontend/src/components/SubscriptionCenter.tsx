import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  getSubscriptionAlerts,
  getSubscriptions,
  remindCancel,
  updateSubscriptionPreferences,
} from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { SubscriptionItem } from '../api/types'

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

function Sparkline({ history }: { history: SubscriptionItem['charge_history'] }) {
  if (!history.length) return null
  const points = history.map((h) => h.amount)
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const coords = points.map((v, i) => {
    const x = (i / Math.max(1, points.length - 1)) * 100
    const y = 100 - ((v - min) / range) * 100
    return `${x},${y}`
  })
  return (
    <svg viewBox="0 0 100 100" className="sparkline" aria-label="Charge history sparkline">
      <polyline points={coords.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="4" />
    </svg>
  )
}

function SubscriptionCenter() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<'all' | 'active' | 'ignored'>('active')
  const [filterIncreased, setFilterIncreased] = useState(false)
  const [filterOptional, setFilterOptional] = useState(false)
  const [threshold, setThreshold] = useState(0.1)
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null)
  const [reminderMessage, setReminderMessage] = useState('')

  const listQuery = useQuery({
    queryKey: [
      ...queryKeys.subscriptions.list,
      status,
      filterIncreased,
      filterOptional,
      threshold,
    ],
    queryFn: () => getSubscriptions({ status, filterIncreased, filterOptional, threshold }),
  })
  const alertsQuery = useQuery({
    queryKey: [...queryKeys.subscriptions.alerts, threshold],
    queryFn: () => getSubscriptionAlerts({ threshold, includeMissed: true }),
  })

  const list = listQuery.data?.subscriptions ?? []
  const selected = useMemo(() => {
    if (!list.length) return null
    return list.find((s) => s.stream_id === selectedStreamId) ?? list[0]
  }, [list, selectedStreamId])

  const prefMutation = useMutation({
    mutationFn: ({ streamId, update }: { streamId: string; update: { essential?: boolean; ignored?: boolean } }) =>
      updateSubscriptionPreferences(streamId, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.list })
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.alerts })
    },
  })

  const remindMutation = useMutation({
    mutationFn: (streamId: string) => remindCancel(streamId),
    onSuccess: (data) => setReminderMessage(data.message),
  })

  return (
    <div className="card">
      <h2>Subscription Center</h2>
      <div className="sub-filters">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="ignored">Ignored</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={filterIncreased}
            onChange={(e) => setFilterIncreased(e.target.checked)}
          />
          Increased only
        </label>
        <label>
          <input
            type="checkbox"
            checked={filterOptional}
            onChange={(e) => setFilterOptional(e.target.checked)}
          />
          Optional only
        </label>
        <label>
          Price increase threshold
          <input
            type="number"
            min={1}
            max={50}
            step={1}
            value={Math.round(threshold * 100)}
            onChange={(e) => setThreshold(Math.max(0.01, Number(e.target.value) / 100))}
          />
          <span>{pct(threshold)}</span>
        </label>
      </div>

      {alertsQuery.data && alertsQuery.data.count > 0 && (
        <div className="sub-alerts">
          <strong>{alertsQuery.data.count} alerts</strong>
          {alertsQuery.data.alerts.slice(0, 4).map((a) => (
            <div key={`${a.stream_id}-${a.alert_type}`}>{a.message}</div>
          ))}
        </div>
      )}

      {listQuery.isLoading && <p>Loading subscriptions...</p>}
      {!listQuery.isLoading && !list.length && <p className="empty-state">No subscriptions detected yet.</p>}

      {list.length > 0 && (
        <div className="sub-grid">
          <div className="sub-list">
            {list.map((item) => (
              <button
                key={item.stream_id}
                type="button"
                className={`sub-list-item ${selected?.stream_id === item.stream_id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedStreamId(item.stream_id)
                  setReminderMessage('')
                }}
              >
                <span>{item.merchant}</span>
                <span>{fmt(item.amount)}</span>
              </button>
            ))}
          </div>
          {selected && (
            <div className="sub-detail">
              <h3>{selected.merchant}</h3>
              <p>
                {selected.cadence} - Confidence {pct(selected.confidence)} - Trend {selected.trend}
              </p>
              <p>
                Current {fmt(selected.amount)} - Baseline {fmt(selected.baseline_amount)} - Next expected{' '}
                {selected.next_expected_charge_date ?? 'n/a'}
              </p>
              <Sparkline history={selected.charge_history} />
              <div className="sub-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    prefMutation.mutate({
                      streamId: selected.stream_id,
                      update: { ignored: true },
                    })
                  }
                >
                  Ignore
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    prefMutation.mutate({
                      streamId: selected.stream_id,
                      update: { essential: !selected.essential },
                    })
                  }
                >
                  {selected.essential ? 'Mark Optional' : 'Mark Essential'}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => remindMutation.mutate(selected.stream_id)}
                >
                  Remind To Cancel
                </button>
              </div>
              {reminderMessage && <p className="budget-hint">{reminderMessage}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SubscriptionCenter
