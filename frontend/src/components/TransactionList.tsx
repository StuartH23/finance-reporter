import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getLedger } from '../api/client'
import { queryKeys } from '../api/queryKeys'

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function TransactionList() {
  const [expanded, setExpanded] = useState(false)

  const { data } = useQuery({
    queryKey: queryKeys.ledger,
    queryFn: getLedger,
  })

  const transactions = data?.transactions ?? []
  const count = data?.count ?? 0

  if (!count) return null

  const visible = expanded ? transactions : transactions.slice(0, 50)

  return (
    <div className="card">
      <h2>All Transactions ({count.toLocaleString()})</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
            <th>Category</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((t, i) => (
            <tr key={`${t.date}-${t.description}-${i}`}>
              <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
              <td>{t.description}</td>
              <td className={`amount ${t.amount >= 0 ? 'positive' : 'negative'}`}>
                {t.amount < 0 ? '-' : ''}
                {fmt(t.amount)}
              </td>
              <td>{t.category}</td>
              <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.source_file}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {count > 50 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: '0.75rem',
            padding: '0.4rem 1rem',
            background: 'var(--border)',
            border: 'none',
            borderRadius: 6,
            color: 'var(--text)',
            fontSize: '0.8rem',
          }}
        >
          {expanded ? 'Show less' : `Show all ${count.toLocaleString()} transactions`}
        </button>
      )}
    </div>
  )
}

export default TransactionList
