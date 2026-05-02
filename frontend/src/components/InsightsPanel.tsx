import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { getInsights } from '../api/client'
import { queryKeys } from '../api/queryKeys'

function fallbackLocale() {
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language
  return 'en-US'
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

function InsightsPanel() {
  const [view, setView] = useState<'dashboard' | 'digest'>('dashboard')

  const { data } = useQuery({
    queryKey: queryKeys.insights,
    queryFn: () => getInsights({ locale: fallbackLocale(), currency: 'USD' }),
  })

  const insights = data?.insights ?? []
  const digest = data?.digest ?? []
  const visible = useMemo(
    () => (view === 'dashboard' ? insights : digest),
    [view, insights, digest],
  )

  if (!insights.length) {
    return (
      <div className="card">
        <h2>Coach Insights</h2>
        <div className="empty-state empty-state-compact">
          Upload at least two full months of data to unlock actionable coaching insights.
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="insights-header-row">
        <h2>Coach Insights{data?.period_label ? ` (${data.period_label})` : ''}</h2>
        <div className="insights-toggle" role="tablist" aria-label="Insight view">
          <button
            type="button"
            className={`ghost-button ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            Dashboard View
          </button>
          <button
            type="button"
            className={`ghost-button ${view === 'digest' ? 'active' : ''}`}
            onClick={() => setView('digest')}
          >
            Weekly Digest
          </button>
        </div>
      </div>

      <div className="insights-list">
        {visible.map((item) => (
          <article key={`${view}-${item.id}-${item.template_key}`} className="insight-item">
            <div className="insight-title-row">
              <h3>{item.title}</h3>
              <span className="insight-confidence">Confidence {pct(item.confidence)}</span>
            </div>
            {view === 'digest' ? (
              <p className="budget-hint u-mb-0">{item.digest}</p>
            ) : (
              <>
                <p>{item.observation}</p>
                <p className="insight-label">Why this matters</p>
                <p>{item.why_this_matters}</p>
                <p className="insight-label">Do this now</p>
                <p>{item.do_this_now}</p>
              </>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}

export default InsightsPanel
