import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { getBudget, getLedger, getBudgetVsActual, getMonthlyPnl, updateBudget } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { BudgetItem } from '../api/types'

type BudgetMode = 'diy' | 'guided'
type GuidedPreset = '50-30-20' | '60-30-10' | 'custom'
type BudgetBucket = 'needs' | 'wants' | 'savings'

const TRANSFER_CATEGORIES = new Set([
  'Credit Card Payments',
  'Venmo Transfers',
  'Personal Transfers',
  'Investments',
])

const PRESET_SPLITS: Record<Exclude<GuidedPreset, 'custom'>, Record<BudgetBucket, number>> = {
  '50-30-20': { needs: 50, wants: 30, savings: 20 },
  '60-30-10': { needs: 60, wants: 30, savings: 10 },
}

function bucketForCategory(category: string): BudgetBucket {
  const c = category.toLowerCase()
  if (
    c.includes('housing') ||
    c.includes('utilities') ||
    c.includes('insurance') ||
    c.includes('medical') ||
    c.includes('grocer') ||
    c.includes('car payment') ||
    c.includes('gas') ||
    c.includes('government') ||
    c.includes('tax')
  ) {
    return 'needs'
  }
  if (
    c.includes('dining') ||
    c.includes('subscription') ||
    c.includes('shopping') ||
    c.includes('entertainment') ||
    c.includes('recreation') ||
    c.includes('travel') ||
    c.includes('donation')
  ) {
    return 'wants'
  }
  return 'savings'
}

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function parseNonNegativeInt(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed)
}

function monthKeyFromDate(dateStr: string) {
  return dateStr.slice(0, 7)
}

function monthEndFromKey(monthKey: string) {
  const [yearStr, monthStr] = monthKey.split('-')
  const year = Number.parseInt(yearStr, 10)
  const month = Number.parseInt(monthStr, 10)
  if (Number.isNaN(year) || Number.isNaN(month)) return `${monthKey}-31`
  const lastDay = new Date(year, month, 0).getDate()
  return `${monthKey}-${String(lastDay).padStart(2, '0')}`
}

function monthLabelFromKey(monthKey: string) {
  const dt = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(dt.getTime())) return monthKey
  return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function monthKeyFromMonthStr(monthStr: string) {
  const dt = new Date(`${monthStr} 1`)
  if (Number.isNaN(dt.getTime())) return null
  const year = dt.getFullYear()
  const month = String(dt.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

interface BudgetEditorProps {
  selectedMonthKey: string | null
  onSelectedMonthKeyChange: (monthKey: string | null) => void
}

function BudgetEditor({ selectedMonthKey, onSelectedMonthKeyChange }: BudgetEditorProps) {
  const queryClient = useQueryClient()
  const [items, setItems] = useState<BudgetItem[]>([])
  const [saved, setSaved] = useState(false)
  const [suggestionStatus, setSuggestionStatus] = useState<string | null>(null)
  const [budgetMode, setBudgetMode] = useState<BudgetMode>('diy')
  const [guidedPreset, setGuidedPreset] = useState<GuidedPreset>('50-30-20')
  const [guidedNeedsPct, setGuidedNeedsPct] = useState(50)
  const [guidedWantsPct, setGuidedWantsPct] = useState(30)
  const [guidedSavingsPct, setGuidedSavingsPct] = useState(20)

  const { data: budgetData } = useQuery({
    queryKey: queryKeys.budget.list,
    queryFn: getBudget,
  })
  const { data: ledgerData } = useQuery({
    queryKey: queryKeys.ledger,
    queryFn: getLedger,
  })
  const { data: comparisonData } = useQuery({
    queryKey: queryKeys.budget.vsActual,
    queryFn: getBudgetVsActual,
  })
  const { data: monthlyPnlData } = useQuery({
    queryKey: queryKeys.pnl.monthly,
    queryFn: getMonthlyPnl,
  })

  useEffect(() => {
    if (budgetData) {
      setItems(
        budgetData.budget.map((item) => ({
          ...item,
          monthly_budget: Math.max(0, Math.round(item.monthly_budget)),
        })),
      )
    }
  }, [budgetData])

  const availableMonthKeys = useMemo(() => {
    if (!ledgerData?.transactions) return []
    const spendingDates = ledgerData.transactions
      .filter((tx) => tx.amount < 0 && !TRANSFER_CATEGORIES.has(tx.category))
      .map((tx) => tx.date)
      .sort()
    if (spendingDates.length === 0) return []

    const minDate = spendingDates[0]
    const maxDate = spendingDates[spendingDates.length - 1]
    const monthKeys = [...new Set(spendingDates.map(monthKeyFromDate))]

    return monthKeys
      .filter((monthKey) => minDate <= `${monthKey}-01` && maxDate >= monthEndFromKey(monthKey))
      .sort()
      .reverse()
  }, [ledgerData])

  useEffect(() => {
    if (availableMonthKeys.length === 0) return
    if (!selectedMonthKey || !availableMonthKeys.includes(selectedMonthKey)) {
      onSelectedMonthKeyChange(availableMonthKeys[0])
    }
  }, [availableMonthKeys, selectedMonthKey, onSelectedMonthKeyChange])

  useEffect(() => {
    if (guidedPreset === 'custom') return
    const preset = PRESET_SPLITS[guidedPreset]
    setGuidedNeedsPct(preset.needs)
    setGuidedWantsPct(preset.wants)
    setGuidedSavingsPct(preset.savings)
  }, [guidedPreset])

  const averageSpentByCategory = useMemo(() => {
    const averages: Record<string, number> = {}
    if (!comparisonData) return averages

    for (const item of comparisonData.comparison) {
      if (item.avg_actual > 0) {
        averages[item.category] = Math.round(item.avg_actual)
      }
    }

    return averages
  }, [comparisonData])

  const selectedMonthSpentByCategory = useMemo(() => {
    const spending: Record<string, number> = {}
    if (!ledgerData?.transactions || !selectedMonthKey) return spending

    for (const tx of ledgerData.transactions) {
      if (tx.amount >= 0) continue
      if (TRANSFER_CATEGORIES.has(tx.category)) continue
      if (monthKeyFromDate(tx.date) !== selectedMonthKey) continue
      const amount = Math.round(-tx.amount)
      spending[tx.category] = (spending[tx.category] ?? 0) + amount
    }

    return spending
  }, [ledgerData, selectedMonthKey])

  const monthsOfData =
    comparisonData?.summary && 'months_of_data' in comparisonData.summary
      ? comparisonData.summary.months_of_data
      : 0

  const recommendedBudgetByCategory = useMemo(() => {
    const categories = new Set([
      ...Object.keys(averageSpentByCategory),
      ...Object.keys(selectedMonthSpentByCategory),
    ])
    const recommended: Record<string, number> = {}
    const recentWeight = monthsOfData >= 6 ? 0.4 : 0.6
    const fixedCostKeywords = [
      'housing',
      'rent',
      'mortgage',
      'car payment',
      'insurance',
      'utilities',
    ]

    for (const category of categories) {
      const avg = averageSpentByCategory[category]
      const selectedMonth = selectedMonthSpentByCategory[category]
      const normalized = category.toLowerCase()
      const isFixedCostCategory = fixedCostKeywords.some((kw) => normalized.includes(kw))

      if (avg && selectedMonth) {
        const pctDiff = Math.abs(selectedMonth - avg) / Math.max(avg, 1)
        if (isFixedCostCategory || pctDiff <= 0.1) {
          recommended[category] = selectedMonth
          continue
        }

        const blended = selectedMonth * recentWeight + avg * (1 - recentWeight)
        const lowerBound = Math.round(avg * 0.75)
        const upperBound = Math.round(avg * 1.5)
        recommended[category] = Math.round(Math.min(Math.max(blended, lowerBound), upperBound))
        continue
      }

      if (selectedMonth) {
        recommended[category] = selectedMonth
        continue
      }

      if (avg) {
        recommended[category] = avg
      }
    }

    return recommended
  }, [averageSpentByCategory, selectedMonthSpentByCategory, monthsOfData])

  const currentBudgetTotal = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(0, Math.round(item.monthly_budget)), 0),
    [items],
  )

  const recommendedBudgetTotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + (recommendedBudgetByCategory[item.category] ?? Math.max(0, item.monthly_budget)),
        0,
      ),
    [items, recommendedBudgetByCategory],
  )

  const incomeByMonthKey = useMemo(() => {
    const map: Record<string, number> = {}
    if (!monthlyPnlData?.months) return map
    for (const month of monthlyPnlData.months) {
      const key = monthKeyFromMonthStr(month.month_str)
      if (key) {
        map[key] = month.income
      }
    }
    return map
  }, [monthlyPnlData])

  const selectedMonthIncome = selectedMonthKey ? (incomeByMonthKey[selectedMonthKey] ?? 0) : 0
  const selectedMonthSpent = useMemo(
    () => Object.values(selectedMonthSpentByCategory).reduce((sum, amount) => sum + amount, 0),
    [selectedMonthSpentByCategory],
  )
  const selectedMonthRemaining = currentBudgetTotal - selectedMonthSpent
  const selectedMonthPctUsed =
    currentBudgetTotal > 0 ? Math.round((selectedMonthSpent / currentBudgetTotal) * 1000) / 10 : 0
  const netAfterSpending = selectedMonthIncome - selectedMonthSpent

  const saveMutation = useMutation({
    mutationFn: (budget: Record<string, number>) => updateBudget(budget),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] })
      setSaved(true)
    },
  })

  const handleChange = (idx: number, value: string) => {
    const updated = [...items]
    const parsed = Number.parseInt(value, 10)
    updated[idx] = {
      ...updated[idx],
      monthly_budget: Number.isNaN(parsed) ? 0 : Math.max(0, parsed),
    }
    setItems(updated)
    setSaved(false)
    setSuggestionStatus(null)
  }

  const handleSave = () => {
    const budget: Record<string, number> = {}
    for (const item of items) {
      budget[item.category] = Math.max(0, Math.round(item.monthly_budget))
    }
    saveMutation.mutate(budget)
  }

  const applySuggestionsToEmpty = () => {
    let updatedCount = 0
    const updatedItems = items.map((item) => {
      const suggestion = recommendedBudgetByCategory[item.category]
      if (item.monthly_budget <= 0 && suggestion) {
        updatedCount += 1
        return { ...item, monthly_budget: suggestion }
      }
      return item
    })

    setItems(updatedItems)
    setSaved(false)
    if (updatedCount > 0) {
      setSuggestionStatus(
        `Filled ${updatedCount} ${updatedCount === 1 ? 'category' : 'categories'} with examples from uploaded data.`,
      )
    } else {
      setSuggestionStatus(
        'No empty categories had enough uploaded spending history for an example.',
      )
    }
  }

  const applySuggestionToRow = (idx: number) => {
    const item = items[idx]
    const suggestion = recommendedBudgetByCategory[item.category]
    if (!suggestion) return

    const updated = [...items]
    updated[idx] = { ...updated[idx], monthly_budget: suggestion }
    setItems(updated)
    setSaved(false)
    setSuggestionStatus(null)
  }

  const splitTotal = guidedNeedsPct + guidedWantsPct + guidedSavingsPct

  const allocateBucket = (
    targetTotal: number,
    bucketCategories: string[],
    current: BudgetItem[],
  ): Record<string, number> => {
    if (bucketCategories.length === 0 || targetTotal <= 0) return {}

    const currentByCategory = new Map(current.map((item) => [item.category, item.monthly_budget]))
    const weights = bucketCategories.map(
      (category) =>
        selectedMonthSpentByCategory[category] ??
        Math.max(0, Math.round(currentByCategory.get(category) ?? 0)),
    )

    const sumWeights = weights.reduce((sum, v) => sum + (v > 0 ? v : 0), 0)
    const fallbackWeight = sumWeights <= 0
    const raw = bucketCategories.map((_, idx) =>
      fallbackWeight ? targetTotal / bucketCategories.length : (targetTotal * weights[idx]) / sumWeights,
    )

    const rounded = raw.map((n) => Math.round(n))
    const diff = Math.round(targetTotal) - rounded.reduce((sum, n) => sum + n, 0)
    if (rounded.length > 0) {
      rounded[rounded.length - 1] += diff
    }

    const out: Record<string, number> = {}
    bucketCategories.forEach((category, idx) => {
      out[category] = Math.max(0, rounded[idx] ?? 0)
    })
    return out
  }

  const applyGuidedSplit = () => {
    if (!selectedMonthIncome || selectedMonthIncome <= 0) {
      setSuggestionStatus(
        'Guided split needs a selected month with income. Pick another month or use DIY mode.',
      )
      return
    }
    if (splitTotal !== 100) {
      setSuggestionStatus('Needs + Wants + Savings/Debt must total 100% before applying.')
      return
    }

    const working = items.filter((item) => item.category !== 'Income')
    const needsCategories = working
      .map((item) => item.category)
      .filter((category) => bucketForCategory(category) === 'needs')
    const wantsCategories = working
      .map((item) => item.category)
      .filter((category) => bucketForCategory(category) === 'wants')
    let savingsCategories = working
      .map((item) => item.category)
      .filter((category) => bucketForCategory(category) === 'savings')

    if (savingsCategories.length === 0) {
      const uncategorized = working.find((item) => item.category === 'Uncategorized')
      if (uncategorized) savingsCategories = [uncategorized.category]
    }

    const needsTarget = (selectedMonthIncome * guidedNeedsPct) / 100
    const wantsTarget = (selectedMonthIncome * guidedWantsPct) / 100
    const savingsTarget = (selectedMonthIncome * guidedSavingsPct) / 100

    const needsAlloc = allocateBucket(needsTarget, needsCategories, working)
    const wantsAlloc = allocateBucket(wantsTarget, wantsCategories, working)
    const savingsAlloc = allocateBucket(savingsTarget, savingsCategories, working)

    const updated = items.map((item) => {
      if (item.category === 'Income') return item
      const allocated =
        needsAlloc[item.category] ?? wantsAlloc[item.category] ?? savingsAlloc[item.category]
      if (allocated === undefined) return { ...item, monthly_budget: 0 }
      return { ...item, monthly_budget: allocated }
    })

    setItems(updated)
    setSaved(false)
    setSuggestionStatus(
      `Applied ${guidedNeedsPct}/${guidedWantsPct}/${guidedSavingsPct} using ${monthLabelFromKey(selectedMonthKey ?? '')} income (${fmt(selectedMonthIncome)}).`,
    )
  }

  return (
    <div className="card">
      <h2>Monthly Budget</h2>
      <div className="budget-guide">
        <p className="budget-guide-title">How to create your budget</p>
        <p className="budget-guide-step">
          1. Start with fixed costs (housing, car payment, utilities, insurance).
        </p>
        <p className="budget-guide-step">
          2. Use spending history from the last {monthsOfData || 'few'} month
          {monthsOfData === 1 ? '' : 's'} as your baseline.
        </p>
        <p className="budget-guide-step">
          3. Choose the month you want to budget from. Fixed costs (like housing) lean on that
          month, while variable costs use a blended recommendation.
        </p>
      </div>
      <div className="budget-guide" style={{ marginBottom: '0.9rem' }}>
        <p className="budget-guide-title">Build Mode</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          <button
            type="button"
            onClick={() => setBudgetMode('diy')}
            className="ghost-button"
            style={{
              borderColor: budgetMode === 'diy' ? 'var(--accent)' : 'var(--border)',
              color: budgetMode === 'diy' ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            DIY
          </button>
          <button
            type="button"
            onClick={() => setBudgetMode('guided')}
            className="ghost-button"
            style={{
              borderColor: budgetMode === 'guided' ? 'var(--accent)' : 'var(--border)',
              color: budgetMode === 'guided' ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            Guided Split
          </button>
        </div>

        {budgetMode === 'guided' && (
          <>
            <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setGuidedPreset('50-30-20')}
                style={{ borderColor: guidedPreset === '50-30-20' ? 'var(--accent)' : 'var(--border)' }}
              >
                50 / 30 / 20
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setGuidedPreset('60-30-10')}
                style={{ borderColor: guidedPreset === '60-30-10' ? 'var(--accent)' : 'var(--border)' }}
              >
                60 / 30 / 10
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setGuidedPreset('custom')}
                style={{ borderColor: guidedPreset === 'custom' ? 'var(--accent)' : 'var(--border)' }}
              >
                Custom
              </button>
            </div>
            <div className="metrics-row" style={{ marginBottom: '0.75rem' }}>
              <div className="metric">
                <div className="label">Needs %</div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={guidedNeedsPct}
                  onChange={(e) => {
                    setGuidedPreset('custom')
                    setGuidedNeedsPct(parseNonNegativeInt(e.target.value))
                  }}
                  style={{
                    width: 100,
                    padding: '0.3rem 0.5rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text)',
                    textAlign: 'right',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
              <div className="metric">
                <div className="label">Wants %</div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={guidedWantsPct}
                  onChange={(e) => {
                    setGuidedPreset('custom')
                    setGuidedWantsPct(parseNonNegativeInt(e.target.value))
                  }}
                  style={{
                    width: 100,
                    padding: '0.3rem 0.5rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text)',
                    textAlign: 'right',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
              <div className="metric">
                <div className="label">Savings + Debt %</div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={guidedSavingsPct}
                  onChange={(e) => {
                    setGuidedPreset('custom')
                    setGuidedSavingsPct(parseNonNegativeInt(e.target.value))
                  }}
                  style={{
                    width: 100,
                    padding: '0.3rem 0.5rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text)',
                    textAlign: 'right',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
              <div className="metric">
                <div className="label">Total</div>
                <div className={`value ${splitTotal === 100 ? 'positive' : 'negative'}`}>{splitTotal}%</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ghost-button"
                onClick={applyGuidedSplit}
                style={{ borderColor: 'var(--accent)', color: 'var(--text)' }}
              >
                Apply Split To Categories
              </button>
              <span className="budget-hint">
                Percentages can change with your goals. Shift Wants down and Savings/Debt up when needed.
              </span>
            </div>
          </>
        )}
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor="budget-month-select"
          className="budget-guide-title"
          style={{ marginRight: '0.5rem' }}
        >
          Budget From Month
        </label>
        <select
          id="budget-month-select"
          value={selectedMonthKey ?? ''}
          onChange={(e) => onSelectedMonthKeyChange(e.target.value)}
          disabled={availableMonthKeys.length === 0}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            borderRadius: 6,
            padding: '0.35rem 0.55rem',
            fontSize: '0.85rem',
          }}
        >
          {availableMonthKeys.map((monthKey) => (
            <option key={monthKey} value={monthKey}>
              {monthLabelFromKey(monthKey)}
            </option>
          ))}
        </select>
      </div>
      {budgetMode === 'guided' && (
        <div className="budget-guide" style={{ marginBottom: '1rem' }}>
          <p className="budget-guide-title">Next Steps Checklist</p>
          <p className="budget-guide-step">1. Review your last 1-3 months of spending by category.</p>
          <p className="budget-guide-step">2. Pick one small change this week (subscription, groceries, or savings transfer).</p>
          <p className="budget-guide-step">3. Automate savings and debt payments to stay consistent.</p>
          <p className="budget-guide-step" style={{ marginTop: '0.45rem' }}>
            Alternative methods: envelope budgeting, zero-based budgeting, and reverse budgeting.
          </p>
        </div>
      )}
      <div className="metrics-row">
        <div className="metric">
          <div className="label">Total Monthly Budget</div>
          <div className="value">{fmt(currentBudgetTotal)}</div>
        </div>
        <div className="metric">
          <div className="label">Recommended Total</div>
          <div className="value">{fmt(recommendedBudgetTotal)}</div>
        </div>
        <div className="metric">
          <div className="label">
            Monthly Income ({selectedMonthKey ? monthLabelFromKey(selectedMonthKey) : 'selected'})
          </div>
          <div className="value">{fmt(selectedMonthIncome)}</div>
        </div>
        <div className="metric">
          <div className="label">Net After Spending</div>
          <div className={`value ${netAfterSpending >= 0 ? 'positive' : 'negative'}`}>
            {netAfterSpending < 0 ? '-' : ''}
            {fmt(netAfterSpending)}
          </div>
        </div>
        <div className="metric">
          <div className="label">
            Spent ({selectedMonthKey ? monthLabelFromKey(selectedMonthKey) : 'selected'})
          </div>
          <div className={`value ${selectedMonthSpent > currentBudgetTotal ? 'negative' : ''}`}>
            {fmt(selectedMonthSpent)}
          </div>
        </div>
        <div className="metric">
          <div className="label">
            Over/Under Budget ({selectedMonthKey ? monthLabelFromKey(selectedMonthKey) : 'selected'})
          </div>
          <div className={`value ${selectedMonthRemaining >= 0 ? 'positive' : 'negative'}`}>
            {selectedMonthRemaining < 0 ? '-' : ''}
            {fmt(selectedMonthRemaining)}
          </div>
        </div>
        <div className="metric">
          <div className="label">
            Used ({selectedMonthKey ? monthLabelFromKey(selectedMonthKey) : 'selected'})
          </div>
          <div
            className={`value ${
              selectedMonthPctUsed > 100 ? 'negative' : selectedMonthPctUsed > 85 ? '' : 'positive'
            }`}
          >
            {selectedMonthPctUsed}%
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">
          No budget data yet. Upload at least one statement on the Profit and Loss Report page, then
          return here to set monthly targets.
        </p>
      ) : (
        <>
          <div className="budget-actions">
            <button
              type="button"
              onClick={applySuggestionsToEmpty}
              disabled={Object.keys(recommendedBudgetByCategory).length === 0}
              style={{
                padding: '0.4rem 0.9rem',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: '0.8rem',
              }}
            >
              Fill Empty With Examples
            </button>
            {suggestionStatus && <span className="budget-hint">{suggestionStatus}</span>}
          </div>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Monthly Budget</th>
                <th style={{ textAlign: 'right' }}>Recommended From Uploads</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.category}>
                  <td>{item.category}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={item.monthly_budget}
                      onChange={(e) => handleChange(idx, e.target.value)}
                      style={{
                        width: 100,
                        padding: '0.3rem 0.5rem',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        color: 'var(--text)',
                        textAlign: 'right',
                        fontSize: '0.875rem',
                      }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {recommendedBudgetByCategory[item.category] ? (
                      <>
                        <div className="suggested-cell">
                          <span className="amount">
                            {fmt(recommendedBudgetByCategory[item.category])}
                          </span>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => applySuggestionToRow(idx)}
                          >
                            Use
                          </button>
                        </div>
                        <div className="budget-hint" style={{ textAlign: 'right' }}>
                          {selectedMonthSpentByCategory[item.category] &&
                          averageSpentByCategory[item.category]
                            ? `Blended: ${monthLabelFromKey(selectedMonthKey ?? '')} ${fmt(selectedMonthSpentByCategory[item.category])} + avg/month ${fmt(averageSpentByCategory[item.category])}`
                            : selectedMonthSpentByCategory[item.category]
                              ? `${monthLabelFromKey(selectedMonthKey ?? '')} from uploads`
                              : `Avg/month from uploads (${monthsOfData || 'few'} month${monthsOfData === 1 ? '' : 's'})`}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="budget-hint">
            "Use" applies a recommendation based on your selected month plus long-term history, with
            guardrails to avoid extreme swings.
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1.5rem',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            {saveMutation.isPending ? 'Saving...' : saved ? 'Saved!' : 'Save Budget'}
          </button>
          {saveMutation.error && (
            <p style={{ color: 'var(--red)', marginTop: '0.5rem' }}>
              Failed to save budget. Please try again.
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default BudgetEditor
