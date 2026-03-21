import { FormEvent, useMemo, useState } from 'react'

import { submitFeatureInterest } from '../api/client'
import type { FeatureInterestResponse } from '../api/types'

const tipLinks = [
  {
    title: 'Budget Worksheet (consumer.gov)',
    description: 'Simple worksheet to map income vs. expenses each month.',
    href: 'https://consumer.gov/your-money/budget-worksheet',
  },
  {
    title: '50/30/20 Budget Calculator (NerdWallet)',
    description: 'Quick way to set a target split for needs, wants, and savings/debt.',
    href: 'https://www.nerdwallet.com/article/finance/nerdwallet-budget-calculator',
  },
  {
    title: 'YNAB Method',
    description: 'Give every dollar a job and rebalance categories as priorities change.',
    href: 'https://www.ynab.com/ynab-method',
  },
  {
    title: 'Envelope Budgeting (Goodbudget)',
    description: 'Classic envelope system adapted for digital budgeting.',
    href: 'https://goodbudget.com/envelope-budgeting/',
  },
]

const appIdeas = [
  {
    feature: 'Rollover Budgets',
    detail: 'Carry unused budget into next month for variable categories (groceries, dining, gifts).',
  },
  {
    feature: 'Flexible vs Category Budget Modes',
    detail: 'Choose strict per-category limits or one flexible spending bucket.',
  },
  {
    feature: 'Move Money Between Categories',
    detail: 'Tap overspent category and fund it from another category without changing total budget.',
  },
  {
    feature: 'Goal Buckets',
    detail: 'Track savings goals (travel, emergency fund, debt payoff) inside budget workflow.',
  },
]

const initialFeatureState = appIdeas.reduce<Record<string, boolean>>((acc, item) => {
  acc[item.feature] = false
  return acc
}, {})

function BudgetResources() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedFeatures, setSelectedFeatures] = useState<Record<string, boolean>>(initialFeatureState)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<FeatureInterestResponse | null>(null)

  const selectedFeatureNames = useMemo(
    () => Object.entries(selectedFeatures).filter(([, selected]) => selected).map(([feature]) => feature),
    [selectedFeatures]
  )

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setResult(null)

    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    if (selectedFeatureNames.length === 0) {
      setError('Pick at least one feature.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await submitFeatureInterest({
        name: name.trim() || undefined,
        email: email.trim(),
        features: selectedFeatureNames,
        notes: notes.trim() || undefined,
      })
      setResult(response)
      setName('')
      setEmail('')
      setNotes('')
      setSelectedFeatures(initialFeatureState)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="card">
      <h2>Budgeting Tips and Ideas</h2>

      <div className="resource-grid" style={{ marginBottom: '1rem' }}>
        {tipLinks.map((item) => (
          <a
            key={item.href}
            className="resource-link"
            href={item.href}
            target="_blank"
            rel="noreferrer"
          >
            <div className="resource-title">{item.title}</div>
            <div className="resource-description">{item.description}</div>
          </a>
        ))}
      </div>

      <div className="budget-guide-title" style={{ marginBottom: '0.5rem' }}>
        Want these features? Join the signup list.
      </div>
      <p className="signup-helper">
        Add your email and choose the ideas you care about most. We will use this to prioritize what to
        build next.
      </p>
      <form className="feature-signup-form" onSubmit={onSubmit}>
        <div className="feature-form-grid">
          <label className="field-label">
            Name (optional)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-input"
              type="text"
              placeholder="Your name"
            />
          </label>
          <label className="field-label">
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-input"
              type="email"
              placeholder="you@example.com"
              required
            />
          </label>
        </div>
        <div className="feature-checkboxes">
          {appIdeas.map((idea) => (
            <label key={idea.feature} className="feature-option">
              <input
                type="checkbox"
                checked={selectedFeatures[idea.feature]}
                onChange={(e) =>
                  setSelectedFeatures((prev) => ({
                    ...prev,
                    [idea.feature]: e.target.checked,
                  }))
                }
              />
              <span>
                <strong>{idea.feature}</strong>
                <small>{idea.detail}</small>
              </span>
            </label>
          ))}
        </div>
        <label className="field-label">
          Notes (optional)
          <textarea
            className="text-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything else you want us to know?"
            rows={3}
          />
        </label>
        <div className="feature-actions">
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Sign Up for Feature Updates'}
          </button>
          <span className="feature-meta">{selectedFeatureNames.length} feature(s) selected</span>
        </div>
        {error && <div className="form-error">{error}</div>}
        {result && (
          <div className="form-success">
            Thanks, you are on the list. Current total signups: <strong>{result.total_signups}</strong>.
          </div>
        )}
      </form>
    </div>
  )
}

export default BudgetResources
