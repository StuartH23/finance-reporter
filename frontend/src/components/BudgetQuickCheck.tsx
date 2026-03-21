import { useQuery } from '@tanstack/react-query'
import { getBudgetQuickCheck } from '../api/client'
import { queryKeys } from '../api/queryKeys'

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function BudgetQuickCheck() {
  const { data } = useQuery({
    queryKey: queryKeys.budget.quickCheck,
    queryFn: getBudgetQuickCheck,
  })

  if (!data || data.status === 'no_data' || !data.categories) return null

  const pctUsed = data.pct_used ?? 0
  const totalBudget = data.total_budget ?? 0
  const totalSpent = data.total_spent ?? 0
  const totalRemaining = data.total_remaining ?? 0
  const overallClass = pctUsed > 100 ? 'negative' : pctUsed > 85 ? '' : 'positive'

  return (
    <div className="card">
      <h2>Quick Check &mdash; {data.month}</h2>

      <div className="metrics-row">
        <div className="metric">
          <div className="label">Budget</div>
          <div className="value">{fmt(totalBudget)}</div>
        </div>
        <div className="metric">
          <div className="label">Spent</div>
          <div className={`value ${totalSpent > totalBudget ? 'negative' : ''}`}>
            {fmt(totalSpent)}
          </div>
        </div>
        <div className="metric">
          <div className="label">Remaining</div>
          <div className={`value ${totalRemaining >= 0 ? 'positive' : 'negative'}`}>
            {totalRemaining < 0 ? '-' : ''}
            {fmt(totalRemaining)}
          </div>
        </div>
        <div className="metric">
          <div className="label">Used</div>
          <div className={`value ${overallClass}`}>{pctUsed}%</div>
        </div>
      </div>

      <div className="progress-bar" style={{ height: 12, marginBottom: '1.5rem' }}>
        <div
          className={`fill ${pctUsed > 100 ? 'over' : pctUsed > 85 ? 'warn' : 'ok'}`}
          style={{ width: `${Math.min(pctUsed, 100)}%` }}
        />
      </div>

      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th style={{ textAlign: 'right' }}>Spent</th>
            <th style={{ textAlign: 'right' }}>Budget</th>
            <th style={{ textAlign: 'right' }}>Remaining</th>
            <th style={{ width: 120 }}>Progress</th>
          </tr>
        </thead>
        <tbody>
          {data.categories.map((c) => {
            const pct = c.pct_used ?? 0
            return (
              <tr key={c.category}>
                <td>{c.category}</td>
                <td className="amount">{fmt(c.spent)}</td>
                <td className="amount" style={{ color: 'var(--text-muted)' }}>
                  {c.budgeted > 0 ? fmt(c.budgeted) : '--'}
                </td>
                <td
                  className={`amount ${c.remaining !== null ? (c.remaining >= 0 ? 'positive' : 'negative') : ''}`}
                >
                  {c.remaining !== null ? (
                    <>
                      {c.remaining < 0 ? '-' : ''}
                      {fmt(c.remaining)}
                    </>
                  ) : (
                    '--'
                  )}
                </td>
                <td>
                  {c.budgeted > 0 && (
                    <div className="progress-bar">
                      <div
                        className={`fill ${pct > 100 ? 'over' : pct > 85 ? 'warn' : 'ok'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default BudgetQuickCheck
