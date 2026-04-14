import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { getMonthlyPnl, getYearlyPnl } from '../api/client'
import { queryKeys } from '../api/queryKeys'

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface PnlTableProps {
  onActiveYearChange?: (year: number | null) => void
}

function PnlTable({ onActiveYearChange }: PnlTableProps) {
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
  const availableYears = useMemo(() => yearly.map((y) => y.year), [yearly])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  useEffect(() => {
    if (!availableYears.length) return
    if (selectedYear === null || !availableYears.includes(selectedYear)) {
      setSelectedYear(Math.max(...availableYears))
    }
  }, [availableYears, selectedYear])

  const activeYear = selectedYear ?? (availableYears.length ? Math.max(...availableYears) : null)
  const selectedYearly = activeYear !== null ? yearly.find((y) => y.year === activeYear) : null
  const monthlyForYear =
    activeYear !== null ? monthly.filter((m) => m.month_str.startsWith(`${activeYear}-`)) : monthly

  useEffect(() => {
    onActiveYearChange?.(activeYear)
  }, [activeYear, onActiveYearChange])

  if (!yearly.length && !monthly.length) return null

  return (
    <>
      {yearly.length > 0 && (
        <div className="card">
          <h2>Yearly P&L</h2>
          <p className="budget-hint" style={{ marginTop: '-0.25rem', marginBottom: '0.75rem' }}>
            P&amp;L excludes transfer categories (credit card payments, Venmo/personal transfers,
            investments).
          </p>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="pnl-year-select"
              style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '0.5rem' }}
            >
              Year
            </label>
            <select
              id="pnl-year-select"
              value={activeYear ?? ''}
              onChange={(e) => setSelectedYear(Number.parseInt(e.target.value, 10))}
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                borderRadius: 6,
                padding: '0.35rem 0.55rem',
                fontSize: '0.85rem',
              }}
            >
              {availableYears
                .slice()
                .sort((a, b) => b - a)
                .map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
            </select>
          </div>
          {selectedYearly && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{selectedYearly.year}</div>
              <div className="metrics-row" style={{ marginBottom: 0 }}>
                <div className="metric">
                  <div className="label">Income</div>
                  <div className="value positive">{fmt(selectedYearly.income)}</div>
                </div>
                <div className="metric">
                  <div className="label">Expenses</div>
                  <div className="value negative">{fmt(selectedYearly.expenses)}</div>
                </div>
                <div className="metric">
                  <div className="label">Net</div>
                  <div className={`value ${selectedYearly.net >= 0 ? 'positive' : 'negative'}`}>
                    {selectedYearly.net >= 0 ? '' : '-'}
                    {fmt(selectedYearly.net)}
                  </div>
                </div>
                <div className="metric">
                  <div className="label">Result</div>
                  <div className={`value ${selectedYearly.profitable ? 'positive' : 'negative'}`}>
                    {selectedYearly.profitable ? 'Profitable' : 'Net Loss'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {monthlyForYear.length > 0 && (
        <div className="card">
          <h2>Monthly P&L{activeYear !== null ? ` (${activeYear})` : ''}</h2>
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
              {monthlyForYear.map((m) => (
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
