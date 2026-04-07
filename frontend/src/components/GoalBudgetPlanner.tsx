import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  createGoal,
  getGoals,
  getSavedPaycheckPlan,
  recommendPaycheckPlan,
  savePaycheckPlan,
  updateGoal,
} from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { Goal, PaycheckObligation, PaycheckPlanResponse } from '../api/types'

function fmtMoney(value: number) {
  return (
    '$' +
    Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, parsed)
}

function toInputAmount(value: number) {
  return Number.isFinite(value) ? String(value) : '0'
}

interface DraftPlan {
  paycheck_amount: number
  fixed_obligations: PaycheckObligation[]
  safety_buffer_reserved: number
  minimum_emergency_buffer: number
  mode: 'balanced' | 'aggressive_savings'
  needs: number
  goals: number
  discretionary: number
  goal_allocations: PaycheckPlanResponse['goal_allocations']
}

function GoalBudgetPlanner() {
  const queryClient = useQueryClient()
  const [goalName, setGoalName] = useState('')
  const [goalAmount, setGoalAmount] = useState('1000')
  const [goalTargetDate, setGoalTargetDate] = useState('')
  const [goalPriority, setGoalPriority] = useState('3')
  const [goalCategory, setGoalCategory] = useState('emergency')
  const [goalStatus, setGoalStatus] = useState('active')
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)

  const [paycheckAmount, setPaycheckAmount] = useState('2000')
  const [safetyBuffer, setSafetyBuffer] = useState('150')
  const [minimumEmergencyBuffer, setMinimumEmergencyBuffer] = useState('100')
  const [paychecksPerMonth, setPaychecksPerMonth] = useState('2')
  const [mode, setMode] = useState<'balanced' | 'aggressive_savings'>('balanced')
  const [obligations, setObligations] = useState<PaycheckObligation[]>([
    { name: 'Rent', amount: 1000 },
    { name: 'Utilities', amount: 120 },
  ])

  const [recommendedPlan, setRecommendedPlan] = useState<PaycheckPlanResponse | null>(null)
  const [draftPlan, setDraftPlan] = useState<DraftPlan | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const { data: goalsData } = useQuery({
    queryKey: queryKeys.goals.list,
    queryFn: getGoals,
  })

  useQuery({
    queryKey: queryKeys.goals.savedPlan,
    queryFn: getSavedPaycheckPlan,
  })

  const goals = goalsData?.goals ?? []
  const activeGoals = useMemo(() => goals.filter((goal) => goal.status === 'active'), [goals])

  const goalMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: goalName.trim(),
        target_amount: parseAmount(goalAmount),
        target_date: goalTargetDate || null,
        priority: Math.max(1, Math.min(5, Number.parseInt(goalPriority, 10) || 3)),
        category: goalCategory,
        status: goalStatus,
      }
      if (editingGoalId) return updateGoal(editingGoalId, payload)
      return createGoal(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.list })
      setGoalName('')
      setGoalAmount('1000')
      setGoalTargetDate('')
      setGoalPriority('3')
      setGoalCategory('emergency')
      setGoalStatus('active')
      setEditingGoalId(null)
    },
  })

  const recommendMutation = useMutation({
    mutationFn: () =>
      recommendPaycheckPlan({
        paycheck_amount: parseAmount(paycheckAmount),
        fixed_obligations: obligations,
        safety_buffer: parseAmount(safetyBuffer),
        minimum_emergency_buffer: parseAmount(minimumEmergencyBuffer),
        mode,
        paychecks_per_month: Math.max(1, Number.parseInt(paychecksPerMonth, 10) || 2),
        goal_ids: activeGoals.map((goal) => goal.id),
      }),
    onSuccess: (plan) => {
      setRecommendedPlan(plan)
      setDraftPlan({
        paycheck_amount: plan.paycheck_amount,
        fixed_obligations: obligations,
        safety_buffer_reserved: plan.safety_buffer_reserved,
        minimum_emergency_buffer: parseAmount(minimumEmergencyBuffer),
        mode: plan.allocation_mode === 'aggressive_savings' ? 'aggressive_savings' : 'balanced',
        needs: plan.needs,
        goals: plan.goals,
        discretionary: plan.discretionary,
        goal_allocations: plan.goal_allocations,
      })
      setSaveMessage(null)
    },
  })

  const saveMutation = useMutation({
    mutationFn: (payload: DraftPlan) => savePaycheckPlan(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.savedPlan })
      setSaveMessage('Custom split saved.')
    },
    onError: () => {
      setSaveMessage('Could not save custom split. Check totals and emergency minimum.')
    },
  })

  const goalProgressPct = (goal: Goal) => Math.max(0, Math.min(100, goal.progress_pct || 0))
  const draftTotal = draftPlan
    ? draftPlan.needs + draftPlan.goals + draftPlan.discretionary + draftPlan.safety_buffer_reserved
    : 0

  return (
    <div>
      <div className="card">
        <h2>Goal Creation Wizard</h2>
        <p className="budget-hint" style={{ marginBottom: '0.8rem' }}>
          Create and prioritize goals. Progress updates from synced transactions.
        </p>
        <div className="feature-form-grid" style={{ marginBottom: '0.8rem' }}>
          <label className="field-label">
            Goal Name
            <input
              className="text-input"
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              placeholder="Emergency Fund"
            />
          </label>
          <label className="field-label">
            Target Amount
            <input
              className="text-input"
              type="number"
              min="0"
              value={goalAmount}
              onChange={(e) => setGoalAmount(e.target.value)}
            />
          </label>
          <label className="field-label">
            Target Date (optional)
            <input
              className="text-input"
              type="date"
              value={goalTargetDate}
              onChange={(e) => setGoalTargetDate(e.target.value)}
            />
          </label>
          <label className="field-label">
            Priority (1 high - 5 low)
            <input
              className="text-input"
              type="number"
              min="1"
              max="5"
              value={goalPriority}
              onChange={(e) => setGoalPriority(e.target.value)}
            />
          </label>
          <label className="field-label">
            Category
            <select
              className="text-input"
              value={goalCategory}
              onChange={(e) => setGoalCategory(e.target.value)}
            >
              <option value="emergency">Emergency Fund</option>
              <option value="vacation">Vacation</option>
              <option value="debt_extra_payment">Debt Extra Payment</option>
              <option value="savings">General Savings</option>
            </select>
          </label>
          <label className="field-label">
            Status
            <select className="text-input" value={goalStatus} onChange={(e) => setGoalStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </label>
        </div>
        <div className="feature-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => goalMutation.mutate()}
            disabled={goalMutation.isPending || goalName.trim().length === 0}
          >
            {goalMutation.isPending ? 'Saving...' : editingGoalId ? 'Update Goal' : 'Create Goal'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Goals</h2>
        {goals.length === 0 ? (
          <p className="empty-state">No goals yet. Add your first goal above.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Progress</th>
                <th style={{ textAlign: 'right' }}>Remaining</th>
                <th style={{ textAlign: 'right' }}>Priority</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((goal) => (
                <tr key={goal.id}>
                  <td>{goal.name}</td>
                  <td>{goal.category}</td>
                  <td style={{ textAlign: 'right' }}>
                    {goalProgressPct(goal).toFixed(1)}% ({fmtMoney(goal.contributed_amount)})
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(goal.remaining_amount)}</td>
                  <td style={{ textAlign: 'right' }}>{goal.priority}</td>
                  <td>{goal.status}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        setEditingGoalId(goal.id)
                        setGoalName(goal.name)
                        setGoalAmount(String(goal.target_amount))
                        setGoalTargetDate(goal.target_date ?? '')
                        setGoalPriority(String(goal.priority))
                        setGoalCategory(goal.category)
                        setGoalStatus(goal.status)
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Paycheck Plan</h2>
        <div className="feature-form-grid" style={{ marginBottom: '0.8rem' }}>
          <label className="field-label">
            Paycheck Amount
            <input
              className="text-input"
              type="number"
              min="0"
              value={paycheckAmount}
              onChange={(e) => setPaycheckAmount(e.target.value)}
            />
          </label>
          <label className="field-label">
            Safety Buffer
            <input
              className="text-input"
              type="number"
              min="0"
              value={safetyBuffer}
              onChange={(e) => setSafetyBuffer(e.target.value)}
            />
          </label>
          <label className="field-label">
            Min Emergency Contribution
            <input
              className="text-input"
              type="number"
              min="0"
              value={minimumEmergencyBuffer}
              onChange={(e) => setMinimumEmergencyBuffer(e.target.value)}
            />
          </label>
          <label className="field-label">
            Paychecks / Month
            <input
              className="text-input"
              type="number"
              min="1"
              max="6"
              value={paychecksPerMonth}
              onChange={(e) => setPaychecksPerMonth(e.target.value)}
            />
          </label>
          <label className="field-label">
            Mode
            <select
              className="text-input"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'balanced' | 'aggressive_savings')}
            >
              <option value="balanced">Balanced</option>
              <option value="aggressive_savings">Aggressive savings</option>
            </select>
          </label>
        </div>

        <p className="budget-guide-title" style={{ marginBottom: '0.35rem' }}>
          Fixed Obligations
        </p>
        {obligations.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '0.45rem', marginBottom: '0.4rem' }}>
            <input
              className="text-input"
              style={{ flex: 1 }}
              value={item.name}
              onChange={(e) => {
                const next = [...obligations]
                next[idx] = { ...next[idx], name: e.target.value }
                setObligations(next)
              }}
              placeholder="Rent"
            />
            <input
              className="text-input"
              style={{ width: 140 }}
              type="number"
              min="0"
              value={toInputAmount(item.amount)}
              onChange={(e) => {
                const next = [...obligations]
                next[idx] = { ...next[idx], amount: parseAmount(e.target.value) }
                setObligations(next)
              }}
            />
            <button
              type="button"
              className="ghost-button"
              onClick={() => setObligations(obligations.filter((_, i) => i !== idx))}
              disabled={obligations.length <= 1}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ghost-button"
          onClick={() => setObligations([...obligations, { name: '', amount: 0 }])}
        >
          Add Obligation
        </button>

        <div style={{ marginTop: '0.8rem' }}>
          <button
            type="button"
            className="primary-button"
            onClick={() => recommendMutation.mutate()}
            disabled={recommendMutation.isPending}
          >
            {recommendMutation.isPending ? 'Calculating...' : 'Generate Recommendation'}
          </button>
        </div>

        {recommendedPlan && draftPlan && (
          <div style={{ marginTop: '1rem' }}>
            <div className="metrics-row">
              <div className="metric">
                <div className="label">Needs</div>
                <div className="value">{fmtMoney(draftPlan.needs)}</div>
              </div>
              <div className="metric">
                <div className="label">Goals</div>
                <div className="value">{fmtMoney(draftPlan.goals)}</div>
              </div>
              <div className="metric">
                <div className="label">Discretionary</div>
                <div className="value">{fmtMoney(draftPlan.discretionary)}</div>
              </div>
              <div className="metric">
                <div className="label">Safety Buffer Reserved</div>
                <div className="value">{fmtMoney(draftPlan.safety_buffer_reserved)}</div>
              </div>
            </div>

            <div className="budget-guide" style={{ marginBottom: '0.8rem' }}>
              <p className="budget-guide-title">What Changed</p>
              {recommendedPlan.what_changed.map((line) => (
                <p key={line} className="budget-guide-step">
                  {line}
                </p>
              ))}
            </div>

            {recommendedPlan.warnings.length > 0 && (
              <div className="sub-alerts" style={{ marginBottom: '0.8rem' }}>
                {recommendedPlan.warnings.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}

            <div className="feature-form-grid" style={{ marginBottom: '0.75rem' }}>
              <label className="field-label">
                Needs Override
                <input
                  className="text-input"
                  type="number"
                  min="0"
                  value={toInputAmount(draftPlan.needs)}
                  onChange={(e) => setDraftPlan({ ...draftPlan, needs: parseAmount(e.target.value) })}
                />
              </label>
              <label className="field-label">
                Goals Override
                <input
                  className="text-input"
                  type="number"
                  min="0"
                  value={toInputAmount(draftPlan.goals)}
                  onChange={(e) => setDraftPlan({ ...draftPlan, goals: parseAmount(e.target.value) })}
                />
              </label>
              <label className="field-label">
                Discretionary Override
                <input
                  className="text-input"
                  type="number"
                  min="0"
                  value={toInputAmount(draftPlan.discretionary)}
                  onChange={(e) =>
                    setDraftPlan({ ...draftPlan, discretionary: parseAmount(e.target.value) })
                  }
                />
              </label>
            </div>

            <p className={'budget-hint ' + (Math.abs(draftTotal - draftPlan.paycheck_amount) < 0.01 ? '' : 'form-error')}>
              Draft total: {fmtMoney(draftTotal)} of {fmtMoney(draftPlan.paycheck_amount)} paycheck
            </p>

            <div className="feature-actions" style={{ marginTop: '0.65rem' }}>
              <button
                type="button"
                className="primary-button"
                onClick={() => saveMutation.mutate(draftPlan)}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Custom Split'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  saveMutation.mutate({
                    paycheck_amount: recommendedPlan.paycheck_amount,
                    fixed_obligations: obligations,
                    safety_buffer_reserved: recommendedPlan.safety_buffer_reserved,
                    minimum_emergency_buffer: parseAmount(minimumEmergencyBuffer),
                    mode:
                      recommendedPlan.allocation_mode === 'aggressive_savings'
                        ? 'aggressive_savings'
                        : 'balanced',
                    needs: recommendedPlan.needs,
                    goals: recommendedPlan.goals,
                    discretionary: recommendedPlan.discretionary,
                    goal_allocations: recommendedPlan.goal_allocations,
                  })
                }
                disabled={saveMutation.isPending}
              >
                Accept Recommendation and Save
              </button>
              {saveMessage && <span className="budget-hint">{saveMessage}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GoalBudgetPlanner
