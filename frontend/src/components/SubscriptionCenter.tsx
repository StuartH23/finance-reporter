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
import { useGuestFeature } from '../guest/GuestFeatureProvider'

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

const CADENCE_MULTIPLIER: Record<string, number> = { weekly: 52, monthly: 12, annual: 1 }

function annualCost(item: SubscriptionItem): number {
  return item.amount * (CADENCE_MULTIPLIER[item.cadence] ?? 12)
}

function totalSpent(item: SubscriptionItem): number {
  return item.charge_history.reduce((sum, h) => sum + h.amount, 0)
}

// Score 0–4: higher = more likely worth cancelling
function cancelPriority(item: SubscriptionItem): number {
  if (!item.active) return 0
  if (item.price_increase && !item.essential) return 4
  if (item.is_new_recurring && !item.essential) return 3
  if (!item.essential && item.charge_count > 3) return 2
  if (!item.essential) return 1
  return 0
}

function indicatorColor(item: SubscriptionItem): string {
  if (!item.active) return 'var(--text-muted)'
  if (item.essential) return '#22c55e'
  if (item.price_increase && !item.essential) return '#ef4444'
  if (!item.essential) return '#f59e0b'
  return 'var(--accent)'
}

function cancelReason(item: SubscriptionItem): string | null {
  if (!item.active || item.essential) return null
  if (item.price_increase) {
    const increase = item.amount - item.baseline_amount
    const increasePct = Math.round((increase / item.baseline_amount) * 100)
    return `Price increased ${increasePct}% (${fmt(item.baseline_amount)} → ${fmt(item.amount)}). That's ${fmt(increase * 12)} extra per year.`
  }
  if (item.is_new_recurring) {
    return `New recurring charge — only ${item.charge_count} payments so far. Did you authorize this?`
  }
  if (item.charge_count > 3) {
    return `Optional — been charging you for ${item.charge_count} months. Still using it?`
  }
  return null
}

function Sparkline({ history }: { history: SubscriptionItem['charge_history'] }) {
  if (history.length < 2) return null
  const points = history.map((h) => h.amount)
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min
  if (range === 0) return null  // flat — activity timeline is enough
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * 100
    const y = 100 - ((v - min) / range) * 100
    return `${x},${y}`
  })
  return (
    <svg viewBox="0 0 100 100" className="sparkline" aria-label="Price history">
      <polyline points={coords.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="4" />
    </svg>
  )
}

function ActivityTimeline({ history }: { history: SubscriptionItem['charge_history'] }) {
  if (history.length < 2) return null
  const times = history.map((h) => new Date(h.date).getTime())
  const minT = Math.min(...times)
  const maxT = Math.max(...times)
  const span = maxT - minT || 1

  const monthTicks: { x: number; label: string }[] = []
  const seenMonths = new Set<string>()
  for (const h of history) {
    const d = new Date(h.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!seenMonths.has(key)) {
      seenMonths.add(key)
      const x = 2 + ((d.getTime() - minT) / span) * 96
      monthTicks.push({ x, label: d.toLocaleString('en-US', { month: 'short' }) })
    }
  }

  return (
    <svg viewBox="0 0 100 36" className="sub-timeline" aria-label="Charge activity timeline">
      <line x1="2" y1="10" x2="98" y2="10" stroke="var(--border)" strokeWidth="1.5" />
      {history.map((h, i) => {
        const x = 2 + ((new Date(h.date).getTime() - minT) / span) * 96
        return <circle key={`${h.date}-${i}`} cx={x} cy="10" r="3.5" fill="var(--accent)" />
      })}
      {monthTicks.map(({ x, label }) => (
        <text key={label} x={x} y="30" fontSize="9" fill="var(--text-muted)" textAnchor="middle">
          {label}
        </text>
      ))}
    </svg>
  )
}

function SubscriptionCenter() {
  const queryClient = useQueryClient()
  const { guardGuestFeature } = useGuestFeature()
  const [status, setStatus] = useState<'all' | 'active' | 'ignored'>('all')
  const [filterIncreased, setFilterIncreased] = useState(false)
  const [filterOptional, setFilterOptional] = useState(false)
  const [threshold, setThreshold] = useState(0.1)
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null)
  const [reminderMessage, setReminderMessage] = useState('')

  const listQuery = useQuery({
    queryKey: [...queryKeys.subscriptions.list, status, filterIncreased, filterOptional, threshold],
    queryFn: () => getSubscriptions({ status, filterIncreased, filterOptional, threshold }),
  })
  const alertsQuery = useQuery({
    queryKey: [...queryKeys.subscriptions.alerts, threshold],
    queryFn: () => getSubscriptionAlerts({ threshold, includeMissed: false }),
  })

  const list = useMemo(() => {
    const raw = listQuery.data?.subscriptions ?? []
    return [...raw].sort((a, b) => {
      const pd = cancelPriority(b) - cancelPriority(a)
      if (pd !== 0) return pd
      return annualCost(b) - annualCost(a)
    })
  }, [listQuery.data])

  const selected = useMemo(
    () => list.find((s) => s.stream_id === selectedStreamId) ?? list[0] ?? null,
    [list, selectedStreamId],
  )

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

  const updatePreference = (streamId: string, update: { essential?: boolean; ignored?: boolean }) => {
    if (guardGuestFeature({
      title: 'Sign in to save subscription choices',
      message: 'Guest Demo lets you review sample subscription alerts. Sign in to ignore subscriptions, mark essentials, and save reminders.',
    })) return
    prefMutation.mutate({ streamId, update })
  }

  const setCancelReminder = (streamId: string) => {
    if (guardGuestFeature({
      title: 'Sign in to save reminders',
      message: 'Guest Demo can show subscription insights, but reminders are locked. Sign in to save cancel reminders.',
    })) return
    remindMutation.mutate(streamId)
  }

  const reason = selected ? cancelReason(selected) : null

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
          <input type="checkbox" checked={filterIncreased} onChange={(e) => setFilterIncreased(e.target.checked)} />
          Increased only
        </label>
        <label>
          <input type="checkbox" checked={filterOptional} onChange={(e) => setFilterOptional(e.target.checked)} />
          Optional only
        </label>
        <label>
          Price increase threshold
          <input
            type="number" min={1} max={50} step={1}
            value={Math.round(threshold * 100)}
            onChange={(e) => setThreshold(Math.max(0.01, Number(e.target.value) / 100))}
          />
          <span>{pct(threshold)}</span>
        </label>
      </div>

      {alertsQuery.data && alertsQuery.data.count > 0 && (
        <div className="sub-alerts">
          <strong>{alertsQuery.data.count} {alertsQuery.data.count === 1 ? 'alert' : 'alerts'}</strong>
          {alertsQuery.data.alerts.slice(0, 4).map((a) => (
            <div key={`${a.stream_id}-${a.alert_type}`}>{a.message}</div>
          ))}
        </div>
      )}

      {listQuery.isLoading && <p>Loading subscriptions...</p>}
      {!listQuery.isLoading && !list.length && (
        <p className="empty-state">No subscriptions detected yet.</p>
      )}

      {list.length > 0 && (
        <div className="sub-grid">
          <div className="sub-list">
            {list.map((item) => (
              <button
                key={item.stream_id}
                type="button"
                className={`sub-list-item ${selected?.stream_id === item.stream_id ? 'selected' : ''}`}
                onClick={() => { setSelectedStreamId(item.stream_id); setReminderMessage('') }}
              >
                <span
                  className="sub-list-indicator"
                  style={{ background: indicatorColor(item) }}
                />
                <span className="sub-list-merchant">
                  <span>{item.merchant}</span>
                  <span className="sub-list-cadence">{item.cadence}</span>
                </span>
                <span className="sub-list-amounts">
                  <span>{fmt(item.amount)}/mo</span>
                  <span className="sub-list-annual">{fmt(annualCost(item))}/yr</span>
                </span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="sub-detail">
              <div className="sub-detail-header">
                <h3>{selected.merchant}</h3>
                {!selected.active && <span className="sub-badge sub-badge-inactive">Inactive</span>}
                {selected.essential && <span className="sub-badge sub-badge-essential">Essential</span>}
                {selected.cancellation_candidate && !selected.essential && (
                  <span className="sub-badge sub-badge-review">Review</span>
                )}
              </div>

              <div className="sub-stats">
                <div className="sub-stat">
                  <span className="sub-stat-value">{fmt(selected.amount)}</span>
                  <span className="sub-stat-label">per {selected.cadence === 'annual' ? 'year' : selected.cadence === 'weekly' ? 'week' : 'month'}</span>
                </div>
                <div className="sub-stat">
                  <span className="sub-stat-value">{fmt(annualCost(selected))}</span>
                  <span className="sub-stat-label">per year</span>
                </div>
                <div className="sub-stat">
                  <span className="sub-stat-value">{fmt(totalSpent(selected))}</span>
                  <span className="sub-stat-label">total paid</span>
                </div>
                <div className="sub-stat">
                  <span className="sub-stat-value">{selected.charge_count}</span>
                  <span className="sub-stat-label">charges</span>
                </div>
              </div>

              {reason && (
                <div className="sub-reason">
                  {reason}
                </div>
              )}

              <div className="sub-detail-meta">
                <span>Last charged {selected.last_charge_date}</span>
              </div>

              <ActivityTimeline history={selected.charge_history} />
              <Sparkline history={selected.charge_history} />

              <div className="sub-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => updatePreference(selected.stream_id, { ignored: true })}
                >
                  Ignore
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => updatePreference(selected.stream_id, { essential: !selected.essential })}
                >
                  {selected.essential ? 'Mark Optional' : 'Mark Essential'}
                </button>
                {selected.cancellation_candidate && (
                  <button
                    type="button"
                    className="primary-button sub-cancel-btn"
                    onClick={() => setCancelReminder(selected.stream_id)}
                  >
                    Cancel This
                  </button>
                )}
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
