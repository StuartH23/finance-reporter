import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getBudget, updateBudget } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { BudgetItem } from '../api/types'

function BudgetEditor() {
  const queryClient = useQueryClient()
  const [items, setItems] = useState<BudgetItem[]>([])
  const [saved, setSaved] = useState(false)

  const { data: budgetData } = useQuery({
    queryKey: queryKeys.budget.list,
    queryFn: getBudget,
  })

  useEffect(() => {
    if (budgetData) {
      setItems(budgetData.budget)
    }
  }, [budgetData])

  const saveMutation = useMutation({
    mutationFn: (budget: Record<string, number>) => updateBudget(budget),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] })
      setSaved(true)
    },
  })

  const handleChange = (idx: number, value: string) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], monthly_budget: parseFloat(value) || 0 }
    setItems(updated)
    setSaved(false)
  }

  const handleSave = () => {
    const budget: Record<string, number> = {}
    for (const item of items) {
      budget[item.category] = item.monthly_budget
    }
    saveMutation.mutate(budget)
  }

  return (
    <div className="card">
      <h2>Monthly Budget</h2>
      {items.length === 0 ? (
        <p className="empty-state">No budget data yet. Upload statements first.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Monthly Budget</th>
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
                      step="25"
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
                </tr>
              ))}
            </tbody>
          </table>
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
