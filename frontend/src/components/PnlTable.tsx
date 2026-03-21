import { useQuery } from '@tanstack/react-query'
import { getMonthlyPnl, getYearlyPnl } from '../api/client'
import { queryKeys } from '../api/queryKeys'

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function PnlTable() {
  const { data: yearlyData } = useQuery({
    queryKey: queryKeys.pnl.yearly,
    queryFn: getYearlyPnl,
  })
  const { data: monthlyData } = useQuery({
    queryKey: queryKeys.pnl.monthly,
    queryFn: getMonthlyPnl,
  })

  const yearly = yearlyData?.years ?? []
  const monthly = monthlyData?.months ?? []

  if (!yearly.length && !monthly.length) return null

  return (
    <>
      {yearly.length > 0 && (
        <div className="card">
          <h2>Yearly P&L</h2>
          <div className="metrics-row">
            {yearly.map((y) => (
              <div key={y.year} style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{y.year}</div>
                <div className="metrics-row" style={{ marginBottom: 0 }}>
                  <div className="metric">
                    <div className="label">Income</div>
                    <div className="value positive">{fmt(y.income)}</div>
                  </div>
                  <div className="metric">
                    <div className="label">Expenses</div>
                    <div className="value negative">{fmt(y.expenses)}</div>
                  </div>
                  <div className="metric">
                    <div className="label">Net</div>
                    <div className={`value ${y.net >= 0 ? 'positive' : 'negative'}`}>
                      {y.net >= 0 ? '' : '-'}
                      {fmt(y.net)}
                    </div>
                  </div>
                  <div className="metric">
                    <div className="label">Result</div>
                    <div className={`value ${y.profitable ? 'positive' : 'negative'}`}>
                      {y.profitable ? 'Profitable' : 'Net Loss'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {monthly.length > 0 && (
        <div className="card">
          <h2>Monthly P&L</h2>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th style={{ textAlign: 'right' }}>Income</th>
                <th style={{ textAlign: 'right' }}>Expenses</th>
                <th style={{ textAlign: 'right' }}>Net</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month_str}>
                  <td>{m.month_str}</td>
                  <td className="amount positive">{fmt(m.income)}</td>
                  <td className="amount negative">{fmt(m.expenses)}</td>
                  <td className={`amount ${m.net >= 0 ? 'positive' : 'negative'}`}>
                    {m.net >= 0 ? '' : '-'}
                    {fmt(m.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default PnlTable
