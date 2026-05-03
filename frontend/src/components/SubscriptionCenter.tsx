import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  getCancelInfo,
  getSubscriptions,
  reviewSubscription,
  updateSubscriptionPreferences,
} from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type {
  CancelInfoResponse,
  SubscriptionItem,
  SubscriptionReviewResponse,
  SubscriptionSummary,
} from '../api/types'
import { useGuestFeature } from '../guest/GuestFeatureProvider'

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`
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

function annualCost(item: SubscriptionItem): number {
  return item.amount * (CADENCE_ANNUAL_FACTOR[item.cadence] ?? 12)
}

function cadenceUnit(item: SubscriptionItem): string {
  return CADENCE_UNIT[item.cadence] ?? '/mo'
}

function totalSpent(item: SubscriptionItem): number {
  return item.charge_history.reduce((sum, h) => sum + h.amount, 0)
}

function indicatorColor(item: SubscriptionItem): string {
  if (!item.active) return 'var(--text-muted)'
  if (item.essential) return 'var(--green)'
  if (item.price_increase) return 'var(--red)'
  return 'var(--yellow)'
}

function categoryIcon(category: string | undefined): string {
  const normalized = (category ?? '').toLowerCase()
  if (normalized.includes('subscription') || normalized.includes('entertainment')) return 'play'
  if (normalized.includes('recreation') || normalized.includes('fitness')) return 'pulse'
  if (normalized.includes('utilities')) return 'bolt'
  if (normalized.includes('auto') || normalized.includes('car')) return 'auto'
  if (normalized.includes('housing')) return 'home'
  if (normalized.includes('medical')) return 'plus'
  if (normalized.includes('dining') || normalized.includes('groceries')) return 'food'
  return 'dot'
}

function categoryIconLabel(category: string | undefined): string {
  return category ? `${category} category` : 'Uncategorized'
}

interface RowActions {
  onToggleEssential: () => void
  onCancelHelp: () => void
  showCancelHelp: boolean
  isEssential: boolean
}

interface RecurringV2Sections {
  active: SubscriptionItem[]
  inactive: SubscriptionItem[]
  upcoming: SubscriptionItem[]
}

function paymentStateLabel(item: SubscriptionItem) {
  switch (item.payment_state) {
    case 'paid_ok':
      return 'Paid on time'
    case 'paid_variance':
      return 'Paid with variance'
    case 'inactive':
      return 'Inactive'
    default:
      return 'Upcoming'
  }
}

function dueLabel(item: SubscriptionItem) {
  return item.next_due_date ?? item.next_expected_charge_date ?? item.last_charge_date
}

function shortDate(value: string | null | undefined): string {
  if (!value) return 'date unknown'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric' })
}

function rowMetaLabel(item: SubscriptionItem): string {
  if (!item.active || item.status_group === 'inactive') {
    return `last charged ${shortDate(item.last_charge_date)} · ${item.charge_count} charges`
  }
  return `renews ${shortDate(item.next_due_date ?? item.next_expected_charge_date)} · last charged ${shortDate(item.last_charge_date)} · ${item.charge_count} charges`
}

function stateLabel(item: SubscriptionItem): string {
  if (!item.active || item.status_group === 'inactive') return 'Inactive'
  if (item.price_increase) return 'Price ↑'
  if (item.is_new_recurring) return 'New'
  if (item.essential) return 'Essential'
  return 'Optional'
}

function stateClass(item: SubscriptionItem): string {
  if (!item.active || item.status_group === 'inactive') return 'muted'
  if (item.price_increase) return 'danger'
  if (item.is_new_recurring) return 'warning'
  if (item.essential) return 'success'
  return 'neutral'
}

function priceChangeLabel(item: SubscriptionItem): string | null {
  if (!item.price_increase || item.baseline_amount <= 0) return null
  const increasePct = Math.round(((item.amount - item.baseline_amount) / item.baseline_amount) * 100)
  return `+${increasePct}%`
}

function isReviewEligible(item: SubscriptionItem): boolean {
  return Boolean(item.is_new_recurring || item.price_increase)
}

function reviewVerdictLabel(verdict: SubscriptionReviewResponse['verdict']): string {
  switch (verdict) {
    case 'likely_authorized':
      return 'Likely authorized'
    case 'price_concern':
      return 'Price concern'
    default:
      return 'Review needed'
  }
}

function reviewVerdictClass(verdict: SubscriptionReviewResponse['verdict']): string {
  if (verdict === 'likely_authorized') return 'success'
  if (verdict === 'price_concern') return 'danger'
  return 'warning'
}

function latestMonthHeroLabel(summary: SubscriptionSummary): string {
  const [year, month] = summary.latest_month_label.split('-').map(Number)
  const date = new Date(year, (month || 1) - 1, 1)
  const monthName = Number.isNaN(date.getTime())
    ? summary.latest_month_label
    : date.toLocaleString('en-US', { month: 'long' })
  return `${monthName} ${summary.latest_month_is_complete ? 'total' : 'so far'}`
}

function SubscriptionHero({ summary }: { summary: SubscriptionSummary }) {
  return (
    <div className="sub-hero" aria-label="Subscription summary">
      <div className="sub-hero-item">
        <span className="sub-hero-value">{fmt(summary.monthly_run_rate)}</span>
        <span className="sub-hero-label">monthly run-rate</span>
      </div>
      <div className="sub-hero-item">
        <span className="sub-hero-value">{summary.active_count}</span>
        <span className="sub-hero-label">active subscriptions</span>
      </div>
      <div className="sub-hero-item">
        <span className="sub-hero-value">{fmt(summary.annual_run_rate)}</span>
        <span className="sub-hero-label">annual run-rate</span>
      </div>
      <div className="sub-hero-item">
        <span className="sub-hero-value">{fmt(summary.latest_month_total)}</span>
        <span className="sub-hero-label">{latestMonthHeroLabel(summary)}</span>
      </div>
    </div>
  )
}

interface SubscriptionRowProps {
  item: SubscriptionItem
  variant: 'other' | 'ignored'
  expanded: boolean
  onToggleDetail: () => void
  actions: RowActions
}

function SubscriptionRow({
  item,
  variant,
  expanded,
  onToggleDetail,
  actions,
}: SubscriptionRowProps) {
  const changeLabel = priceChangeLabel(item)
  const recentCharges = item.charge_history.slice(-6).reverse()
  const showReview = variant !== 'ignored' && isReviewEligible(item)

  return (
    <div className={`sub-row sub-row-${variant} ${expanded ? 'expanded' : ''}`}>
      <div className="sub-row-summary">
        <button
          type="button"
          className="sub-row-main"
          onClick={onToggleDetail}
          aria-expanded={expanded}
        >
          <span className="sub-row-indicator" style={{ background: indicatorColor(item) }} />
          <span
            className={`sub-category-icon ${categoryIcon(item.dominant_category)}`}
            aria-label={categoryIconLabel(item.dominant_category)}
            title={item.dominant_category ?? 'Uncategorized'}
          />
          <span className="sub-row-merchant">
            <span className="sub-row-name">{item.merchant}</span>
            <span className="sub-row-meta">{rowMetaLabel(item)}</span>
          </span>
          <span className="sub-row-amount">
            {fmt(item.amount)}
            {cadenceUnit(item)}
          </span>
          {changeLabel && <span className="sub-change-chip">{changeLabel}</span>}
          <span className={`sub-state-pill ${stateClass(item)}`}>{stateLabel(item)}</span>
        </button>
        <span className="sub-row-actions">
          {variant !== 'ignored' && (
            <button type="button" className="ghost-button" onClick={actions.onToggleEssential}>
              {actions.isEssential ? 'Mark Optional' : 'Mark Essential'}
            </button>
          )}
          {variant !== 'ignored' && actions.showCancelHelp && (
            <button
              type="button"
              className="ghost-button accent"
              onClick={actions.onCancelHelp}
            >
              How to Cancel
            </button>
          )}
        </span>
      </div>

      {expanded && (
        <div className="sub-row-detail">
          <div className="sub-detail-meta">
            <span>Total paid {fmt(totalSpent(item))}</span>
            <span>{fmt(annualCost(item))}/yr run-rate</span>
            <span>{paymentStateLabel(item)}</span>
          </div>
          <div className="sub-charge-list">
            {recentCharges.length === 0 && <span>No charge history available.</span>}
            {recentCharges.map((charge) => (
              <span key={`${charge.date}-${charge.amount}`}>
                {shortDate(charge.date)} {fmt(charge.amount)}
              </span>
            ))}
          </div>
          {showReview && <ReviewSection item={item} />}
        </div>
      )}
    </div>
  )
}

export function ReviewSection({ item }: { item: SubscriptionItem }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => reviewSubscription(item.stream_id),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.subscriptions.review(item.stream_id), data)
    },
  })
  const cachedReview = queryClient.getQueryData<SubscriptionReviewResponse>(
    queryKeys.subscriptions.review(item.stream_id),
  )
  const review = mutation.data ?? cachedReview

  return (
    <div className="sub-review">
      <div className="sub-review-copy">
        <span className="sub-review-title">AI review</span>
        <span className="sub-review-meta">
          {item.price_increase ? 'Checks the price change signal.' : 'Checks this new recurring charge.'}
        </span>
      </div>
      <button
        type="button"
        className="ghost-button accent"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Reviewing…' : review ? 'Review again' : 'Review charge'}
      </button>
      {mutation.isError && (
        <p className="sub-review-error">Could not review this subscription right now.</p>
      )}
      {review && (
        <div className="sub-review-result">
          <span className={`sub-state-pill ${reviewVerdictClass(review.verdict)}`}>
            {reviewVerdictLabel(review.verdict)}
            {review.cached ? ' · cached' : ''}
          </span>
          <p>{review.reason}</p>
          {review.evidence.length > 0 && (
            <ul>
              {review.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function buildSearchUrl(merchant: string): string {
  const query = encodeURIComponent(`how to cancel ${merchant}`)
  return `https://www.google.com/search?q=${query}`
}

interface CancelPanelProps {
  item: SubscriptionItem
  onClose: () => void
  onStopTracking: () => void
  isStopTrackingPending: boolean
}

export function CancelPanel({
  item,
  onClose,
  onStopTracking,
  isStopTrackingPending,
}: CancelPanelProps) {
  const infoQuery = useQuery({
    queryKey: queryKeys.subscriptions.cancelInfo(item.stream_id),
    queryFn: () => getCancelInfo(item.stream_id),
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const info: CancelInfoResponse | undefined = infoQuery.data
  const headerName = info?.found && info.display_name ? info.display_name : item.merchant
  const searchUrl = buildSearchUrl(item.merchant)

  return (
    <div className="cancel-panel-backdrop" role="presentation" onClick={onClose}>
      <div
        className="cancel-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`How to cancel ${headerName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cancel-panel-header">
          <h3>Cancel {headerName}</h3>
          <button
            type="button"
            className="cancel-panel-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <p className="cancel-panel-meta">
          {item.merchant} · {fmt(item.amount)}
          {cadenceUnit(item)} · last charged {shortDate(item.last_charge_date)}
        </p>

        {infoQuery.isLoading && (
          <p className="cancel-panel-note">Looking up cancellation info…</p>
        )}

        {infoQuery.isError && (
          <div className="cancel-panel-body">
            <p className="cancel-panel-note">
              Couldn't load cancellation info — the subscription may no longer be tracked.
            </p>
            <a
              className="cancel-panel-primary"
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Search web for cancellation instructions
            </a>
          </div>
        )}

        {info && info.found && (
          <div className="cancel-panel-body">
            {info.cancel_url ? (
              <a
                className="cancel-panel-primary"
                href={info.cancel_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open cancellation page
              </a>
            ) : (
              <p className="cancel-panel-note">
                {headerName} doesn't offer a self-service cancellation page.
              </p>
            )}
            {info.support_url && (
              <a
                className="cancel-panel-secondary"
                href={info.support_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open support page
              </a>
            )}
            {info.phone && <p className="cancel-panel-phone">Or call: {info.phone}</p>}
            {info.notes && <p className="cancel-panel-notes">{info.notes}</p>}
          </div>
        )}

        {info && !info.found && (
          <div className="cancel-panel-body">
            <p className="cancel-panel-note">
              We don't have a cancellation page for this service yet.
            </p>
            <a
              className="cancel-panel-primary"
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Search web for cancellation instructions
            </a>
          </div>
        )}

        <footer className="cancel-panel-footer">
          <button
            type="button"
            className="ghost-button"
            onClick={onStopTracking}
            disabled={isStopTrackingPending}
          >
            I canceled this — stop tracking
          </button>
        </footer>
      </div>
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
  const [expandedDetailId, setExpandedDetailId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'upcoming' | 'all'>('upcoming')
  const [cancelPanelItem, setCancelPanelItem] = useState<SubscriptionItem | null>(null)

  const listQuery = useQuery({
    queryKey: [
      ...queryKeys.subscriptions.list,
      activeView,
      filterIncreased,
      filterOptional,
      threshold,
    ],
    queryFn: () =>
      getSubscriptions({
        status: 'all',
        filterIncreased,
        filterOptional,
        threshold,
        view: activeView,
        sort: activeView === 'upcoming' ? 'due_asc' : 'priority',
      }),
  })

  const all = useMemo(() => listQuery.data?.subscriptions ?? [], [listQuery.data])
  const summary = listQuery.data?.summary

  const recurringSections = useMemo<RecurringV2Sections>(() => {
    const active = all
      .filter((item) => item.status_group !== 'inactive' && !item.ignored)
      .sort((a, b) => dueLabel(a).localeCompare(dueLabel(b)))
    const inactive = all
      .filter((item) => item.status_group === 'inactive' || item.ignored)
      .sort((a, b) => annualCost(b) - annualCost(a))
    const upcoming = active.slice().sort((a, b) => dueLabel(a).localeCompare(dueLabel(b)))
    return { active, inactive, upcoming }
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

  const updatePreference = (
    streamId: string,
    update: { essential?: boolean; ignored?: boolean },
  ) => {
    if (
      guardGuestFeature({
        title: 'Sign in to save subscription choices',
        message:
          'Guest Demo lets you review sample subscription alerts. Sign in to mark essentials and save subscription choices.',
      })
    )
      return
    prefMutation.mutate({ streamId, update })
  }

  const buildActions = (item: SubscriptionItem, allowCancelHelp: boolean): RowActions => ({
    onToggleEssential: () => updatePreference(item.stream_id, { essential: !item.essential }),
    onCancelHelp: () => setCancelPanelItem(item),
    showCancelHelp: allowCancelHelp,
    isEssential: item.essential,
  })

  const handleStopTracking = () => {
    if (!cancelPanelItem) return
    if (
      guardGuestFeature({
        title: 'Sign in to stop tracking subscriptions',
        message:
          'Guest Demo lets you preview the cancel flow. Sign in to stop tracking subscriptions you have canceled.',
      })
    )
      return
    prefMutation.mutate(
      { streamId: cancelPanelItem.stream_id, update: { ignored: true } },
      { onSuccess: () => setCancelPanelItem(null) },
    )
  }

  const toggleDetail = (streamId: string) => {
    setExpandedDetailId((prev) => (prev === streamId ? null : streamId))
  }

  return (
    <div className="card">
      <div className="sub-page-header">
        <h2>Subscription Center</h2>
        <div className="sub-header-controls">
          <div className="dashboard-report-tabs" role="tablist" aria-label="Subscription views">
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'upcoming'}
              className={activeView === 'upcoming' ? 'active' : ''}
              onClick={() => setActiveView('upcoming')}
            >
              Upcoming
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'all'}
              className={activeView === 'all' ? 'active' : ''}
              onClick={() => setActiveView('all')}
            >
              All
            </button>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
          >
            Advanced {showAdvanced ? '▴' : '▾'}
          </button>
        </div>
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

      {summary && <SubscriptionHero summary={summary} />}

      {listQuery.isLoading && <p>Loading subscriptions...</p>}
      {!listQuery.isLoading && all.length === 0 && (
        <p className="empty-state">No subscriptions detected yet.</p>
      )}

      {!listQuery.isLoading && activeView === 'upcoming' && (
        <section className="sub-section sub-section-upcoming">
          <header className="sub-section-header">
            <h3>Upcoming</h3>
          </header>
          <div className="sub-section-body">
            {recurringSections.upcoming.length === 0 && (
              <p className="empty-state">No upcoming recurring charges.</p>
            )}
            {recurringSections.upcoming.map((item) => (
              <SubscriptionRow
                key={item.stream_id}
                item={item}
                variant="other"
                expanded={expandedDetailId === item.stream_id}
                onToggleDetail={() => toggleDetail(item.stream_id)}
                actions={buildActions(item, true)}
              />
            ))}
          </div>
        </section>
      )}

      {cancelPanelItem && (
        <CancelPanel
          item={cancelPanelItem}
          onClose={() => setCancelPanelItem(null)}
          onStopTracking={handleStopTracking}
          isStopTrackingPending={prefMutation.isPending}
        />
      )}

      {!listQuery.isLoading && activeView === 'all' && (
        <>
          <section className="sub-section sub-section-other">
            <header className="sub-section-header">
              <h3>Active</h3>
            </header>
            <div className="sub-section-body">
              {recurringSections.active.length === 0 && (
                <p className="empty-state">No active subscriptions.</p>
              )}
              {recurringSections.active.map((item) => (
                <SubscriptionRow
                  key={item.stream_id}
                  item={item}
                  variant="other"
                  expanded={expandedDetailId === item.stream_id}
                  onToggleDetail={() => toggleDetail(item.stream_id)}
                  actions={buildActions(item, true)}
                />
              ))}
            </div>
          </section>
          <section className="sub-section sub-section-ignored">
            <header className="sub-section-header">
              <h3>Inactive</h3>
            </header>
            <div className="sub-section-body">
              {recurringSections.inactive.length === 0 && (
                <p className="empty-state">No inactive subscriptions.</p>
              )}
              {recurringSections.inactive.map((item) => (
                <SubscriptionRow
                  key={item.stream_id}
                  item={item}
                  variant="ignored"
                  expanded={expandedDetailId === item.stream_id}
                  onToggleDetail={() => toggleDetail(item.stream_id)}
                  actions={buildActions(item, false)}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

export default SubscriptionCenter
