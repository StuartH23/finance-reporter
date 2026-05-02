import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { getSubscriptions, remindCancel, updateSubscriptionPreferences } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { SubscriptionItem } from '../api/types'
import { useGuestFeature } from '../guest/GuestFeatureProvider'

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

const CADENCE_MONTHLY_FACTOR: Record<string, number> = {
  weekly: 52 / 12,
  monthly: 1,
  annual: 1 / 12,
}

const CADENCE_ANNUAL_FACTOR: Record<string, number> = {
  weekly: 52,
  monthly: 12,
  annual: 1,
}

const CADENCE_UNIT: Record<string, string> = {
  weekly: '/wk',
  monthly: '/mo',
  annual: '/yr',
}

function monthlyAmount(item: SubscriptionItem): number {
  return item.amount * (CADENCE_MONTHLY_FACTOR[item.cadence] ?? 1)
}

function annualCost(item: SubscriptionItem): number {
  return item.amount * (CADENCE_ANNUAL_FACTOR[item.cadence] ?? 12)
}

function cadenceUnit(item: SubscriptionItem): string {
  return CADENCE_UNIT[item.cadence] ?? '/mo'
}

function totalSpent(item: SubscriptionItem): number {
  return item.charge_history.reduce((sum, h) => sum + h.amount, 0)
}

// Score 0–4: higher = more likely worth cancelling.
function cancelPriority(item: SubscriptionItem): number {
  if (!item.active || item.essential) return 0
  if (item.price_increase) return 4
  if (item.is_new_recurring) return 3
  if (item.charge_count > 3) return 2
  return 1
}

function indicatorColor(item: SubscriptionItem): string {
  if (!item.active) return 'var(--text-muted)'
  if (item.essential) return 'var(--green)'
  if (item.price_increase) return 'var(--red)'
  return 'var(--yellow)'
}

function cancelReason(item: SubscriptionItem): string | null {
  if (!item.active || item.essential) return null
  if (item.price_increase && item.baseline_amount > 0) {
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
  if (range === 0) return null
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
      {history.map((h) => {
        const x = 2 + ((new Date(h.date).getTime() - minT) / span) * 96
        return <circle key={`${h.date}-${h.amount}`} cx={x} cy="10" r="3.5" fill="var(--accent)" />
      })}
      {monthTicks.map(({ x, label }) => (
        <text key={label} x={x} y="30" fontSize="9" fill="var(--text-muted)" textAnchor="middle">
          {label}
        </text>
      ))}
    </svg>
  )
}

interface RowActions {
  onIgnore: () => void
  onToggleEssential: () => void
  onSetReminder: () => void
  showSetReminder: boolean
  isEssential: boolean
}

interface SubscriptionRowProps {
  item: SubscriptionItem
  variant: 'review' | 'essential' | 'other' | 'ignored'
  expanded: boolean
  onToggleDetail: () => void
  actions: RowActions
  reminderMessage?: string
}

function SubscriptionRow({
  item,
  variant,
  expanded,
  onToggleDetail,
  actions,
  reminderMessage,
}: SubscriptionRowProps) {
  const reason = cancelReason(item)
  const showReason = variant === 'review' && reason

  return (
    <div className={`sub-row sub-row-${variant} ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="sub-row-summary"
        onClick={onToggleDetail}
        aria-expanded={expanded}
      >
        <span className="sub-row-indicator" style={{ background: indicatorColor(item) }} />
        <span className="sub-row-merchant">
          <span className="sub-row-name">{item.merchant}</span>
          <span className="sub-row-cadence">{item.cadence}</span>
        </span>
        <span className="sub-row-amounts">
          <span className="sub-row-amount">
            {fmt(item.amount)}
            {cadenceUnit(item)}
          </span>
          <span className="sub-row-annual">{fmt(annualCost(item))}/yr</span>
        </span>
      </button>

      {showReason && <div className="sub-row-reason">{reason}</div>}

      {variant !== 'ignored' && (
        <div className="sub-row-actions">
          <button type="button" className="ghost-button" onClick={actions.onIgnore}>
            Ignore
          </button>
          <button type="button" className="ghost-button" onClick={actions.onToggleEssential}>
            {actions.isEssential ? 'Mark Optional' : 'Mark Essential'}
          </button>
          {actions.showSetReminder && (
            <button type="button" className="ghost-button accent" onClick={actions.onSetReminder}>
              Set Reminder
            </button>
          )}
        </div>
      )}

      {reminderMessage && <p className="budget-hint sub-row-reminder">{reminderMessage}</p>}

      {expanded && (
        <div className="sub-row-detail">
          <div className="sub-stats">
            <div className="sub-stat">
              <span className="sub-stat-value">{fmt(monthlyAmount(item))}</span>
              <span className="sub-stat-label">per month</span>
            </div>
            <div className="sub-stat">
              <span className="sub-stat-value">{fmt(annualCost(item))}</span>
              <span className="sub-stat-label">per year</span>
            </div>
            <div className="sub-stat">
              <span className="sub-stat-value">{fmt(totalSpent(item))}</span>
              <span className="sub-stat-label">total paid</span>
            </div>
            <div className="sub-stat">
              <span className="sub-stat-value">{item.charge_count}</span>
              <span className="sub-stat-label">charges</span>
            </div>
          </div>
          <div className="sub-detail-meta">
            <span>Last charged {item.last_charge_date}</span>
          </div>
          <ActivityTimeline history={item.charge_history} />
          <Sparkline history={item.charge_history} />
        </div>
      )}
    </div>
  )
}

function SubscriptionCenter() {
  const queryClient = useQueryClient()
  const { guardGuestFeature } = useGuestFeature()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [filterIncreased, setFilterIncreased] = useState(false)
  const [filterOptional, setFilterOptional] = useState(false)
  const [threshold, setThreshold] = useState(0.1)
  const [showIgnored, setShowIgnored] = useState(false)
  const [expandedDetailId, setExpandedDetailId] = useState<string | null>(null)
  const [reminderMessages, setReminderMessages] = useState<Record<string, string>>({})

  const listQuery = useQuery({
    queryKey: [...queryKeys.subscriptions.list, 'all', filterIncreased, filterOptional, threshold],
    queryFn: () => getSubscriptions({ status: 'all', filterIncreased, filterOptional, threshold }),
  })

  const all = useMemo(() => listQuery.data?.subscriptions ?? [], [listQuery.data])

  const sections = useMemo(() => {
    const review: SubscriptionItem[] = []
    const otherActive: SubscriptionItem[] = []
    const essential: SubscriptionItem[] = []
    const ignored: SubscriptionItem[] = []

    for (const item of all) {
      if (item.ignored) {
        ignored.push(item)
      } else if (item.essential) {
        essential.push(item)
      } else if (item.active && cancelPriority(item) > 0) {
        review.push(item)
      } else if (item.active) {
        otherActive.push(item)
      } else {
        otherActive.push(item)
      }
    }

    review.sort((a, b) => {
      const pd = cancelPriority(b) - cancelPriority(a)
      if (pd !== 0) return pd
      return annualCost(b) - annualCost(a)
    })
    essential.sort((a, b) => annualCost(b) - annualCost(a))
    otherActive.sort((a, b) => annualCost(b) - annualCost(a))

    const monthlyAtRisk = review.reduce((sum, s) => sum + monthlyAmount(s), 0)
    const essentialMonthly = essential.reduce((sum, s) => sum + monthlyAmount(s), 0)

    return { review, otherActive, essential, ignored, monthlyAtRisk, essentialMonthly }
  }, [all])

  const prefMutation = useMutation({
    mutationFn: ({
      streamId,
      update,
    }: {
      streamId: string
      update: { essential?: boolean; ignored?: boolean }
    }) => updateSubscriptionPreferences(streamId, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.list })
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.alerts })
    },
  })

  const remindMutation = useMutation({
    mutationFn: (streamId: string) => remindCancel(streamId),
    onSuccess: (data, streamId) =>
      setReminderMessages((prev) => ({ ...prev, [streamId]: data.message })),
  })

  const updatePreference = (
    streamId: string,
    update: { essential?: boolean; ignored?: boolean },
  ) => {
    if (
      guardGuestFeature({
        title: 'Sign in to save subscription choices',
        message:
          'Guest Demo lets you review sample subscription alerts. Sign in to ignore subscriptions, mark essentials, and save reminders.',
      })
    )
      return
    prefMutation.mutate({ streamId, update })
  }

  const setReminder = (streamId: string) => {
    if (
      guardGuestFeature({
        title: 'Sign in to save reminders',
        message:
          'Guest Demo can show subscription insights, but reminders are locked. Sign in to save cancel reminders.',
      })
    )
      return
    remindMutation.mutate(streamId)
  }

  const buildActions = (item: SubscriptionItem, allowReminder: boolean): RowActions => ({
    onIgnore: () => updatePreference(item.stream_id, { ignored: true }),
    onToggleEssential: () => updatePreference(item.stream_id, { essential: !item.essential }),
    onSetReminder: () => setReminder(item.stream_id),
    showSetReminder: allowReminder,
    isEssential: item.essential,
  })

  const toggleDetail = (streamId: string) => {
    setExpandedDetailId((prev) => (prev === streamId ? null : streamId))
  }

  const reviewCountLabel = `${sections.review.length} ${sections.review.length === 1 ? 'subscription' : 'subscriptions'}`
  const essentialCountLabel = `${sections.essential.length} ${sections.essential.length === 1 ? 'subscription' : 'subscriptions'}`
  const otherCountLabel = `${sections.otherActive.length} ${sections.otherActive.length === 1 ? 'subscription' : 'subscriptions'}`
  const ignoredCountLabel = `${sections.ignored.length} ${sections.ignored.length === 1 ? 'subscription' : 'subscriptions'}`

  return (
    <div className="card">
      <div className="sub-page-header">
        <h2>Subscription Center</h2>
        <button
          type="button"
          className="ghost-button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          Advanced {showAdvanced ? '▴' : '▾'}
        </button>
      </div>

      {showAdvanced && (
        <div className="sub-filters">
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
      )}

      {listQuery.isLoading && <p>Loading subscriptions...</p>}
      {!listQuery.isLoading && all.length === 0 && (
        <p className="empty-state">No subscriptions detected yet.</p>
      )}

      {sections.review.length > 0 && (
        <section className="sub-section sub-section-review">
          <header className="sub-section-header">
            <h3>
              Needs Review · {reviewCountLabel} · {fmt(sections.monthlyAtRisk)}/mo at risk
            </h3>
          </header>
          <div className="sub-section-body">
            {sections.review.map((item) => (
              <SubscriptionRow
                key={item.stream_id}
                item={item}
                variant="review"
                expanded={expandedDetailId === item.stream_id}
                onToggleDetail={() => toggleDetail(item.stream_id)}
                actions={buildActions(item, true)}
                reminderMessage={reminderMessages[item.stream_id]}
              />
            ))}
          </div>
        </section>
      )}

      {sections.otherActive.length > 0 && (
        <section className="sub-section sub-section-other">
          <header className="sub-section-header">
            <h3>Other Active · {otherCountLabel}</h3>
          </header>
          <div className="sub-section-body">
            {sections.otherActive.map((item) => (
              <SubscriptionRow
                key={item.stream_id}
                item={item}
                variant="other"
                expanded={expandedDetailId === item.stream_id}
                onToggleDetail={() => toggleDetail(item.stream_id)}
                actions={buildActions(item, false)}
                reminderMessage={reminderMessages[item.stream_id]}
              />
            ))}
          </div>
        </section>
      )}

      {sections.essential.length > 0 && (
        <section className="sub-section sub-section-essential">
          <header className="sub-section-header">
            <h3>
              Essential · {essentialCountLabel} · {fmt(sections.essentialMonthly)}/mo
            </h3>
          </header>
          <div className="sub-section-body">
            {sections.essential.map((item) => (
              <SubscriptionRow
                key={item.stream_id}
                item={item}
                variant="essential"
                expanded={expandedDetailId === item.stream_id}
                onToggleDetail={() => toggleDetail(item.stream_id)}
                actions={buildActions(item, false)}
                reminderMessage={reminderMessages[item.stream_id]}
              />
            ))}
          </div>
        </section>
      )}

      {sections.ignored.length > 0 && (
        <section className="sub-section sub-section-ignored">
          <header className="sub-section-header">
            <h3>Ignored · {ignoredCountLabel}</h3>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setShowIgnored((v) => !v)}
              aria-expanded={showIgnored}
            >
              {showIgnored ? 'Hide' : 'Show'}
            </button>
          </header>
          {showIgnored && (
            <div className="sub-section-body">
              {sections.ignored.map((item) => (
                <SubscriptionRow
                  key={item.stream_id}
                  item={item}
                  variant="ignored"
                  expanded={expandedDetailId === item.stream_id}
                  onToggleDetail={() => toggleDetail(item.stream_id)}
                  actions={buildActions(item, false)}
                  reminderMessage={reminderMessages[item.stream_id]}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default SubscriptionCenter
