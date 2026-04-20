import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getLedger } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { CashFlowGranularity, Transaction } from '../api/types'
import { normalizeMerchantLabel } from '../utils/merchant'

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function matchesPeriod(date: string, periodKey: string, granularity: CashFlowGranularity) {
  if (granularity === 'month') return date.startsWith(periodKey)

  const match = periodKey.match(/^(\d{4})-Q([1-4])$/)
  if (!match) return true
  const [, yearStr, quarterStr] = match
  if (!date.startsWith(`${yearStr}-`)) return false
  const month = Number.parseInt(date.slice(5, 7), 10)
  const quarter = Math.floor((month - 1) / 3) + 1
  return quarter === Number.parseInt(quarterStr, 10)
}

function transactionKey(transaction: Transaction) {
  return [
    transaction.date,
    transaction.description,
    transaction.amount,
    transaction.category,
    transaction.source_file,
  ].join('|')
}

function keyedTransactions(transactions: Transaction[]) {
  const occurrences = new Map<string, number>()
  return transactions.map((transaction) => {
    const baseKey = transactionKey(transaction)
    const occurrence = (occurrences.get(baseKey) ?? 0) + 1
    occurrences.set(baseKey, occurrence)
    return { transaction, key: `${baseKey}|${occurrence}` }
  })
}

interface TransactionFilters {
  granularity?: CashFlowGranularity
  periodKey?: string | null
  category?: string | null
  merchant?: string | null
}

interface TransactionListProps {
  title?: string
  filters?: TransactionFilters
}

function TransactionList({ title = 'All Transactions', filters }: TransactionListProps) {
  const [expanded, setExpanded] = useState(false)

  const { data } = useQuery({
    queryKey: queryKeys.ledger,
    queryFn: getLedger,
  })

  const transactions = data?.transactions ?? []
  const allCount = data?.count ?? 0

  if (!allCount) return null

  const filtered = transactions.filter((tx) => {
    if (
      filters?.periodKey &&
      filters.granularity &&
      !matchesPeriod(tx.date, filters.periodKey, filters.granularity)
    ) {
      return false
    }
    if (filters?.category && tx.category !== filters.category) {
      return false
    }
    if (filters?.merchant && normalizeMerchantLabel(tx.description) !== filters.merchant) {
      return false
    }
    return true
  })

  const count = filtered.length
  if (!count) {
    return (
      <div className="card">
        <h2>{title}</h2>
        <p className="empty-state">No transactions match the selected cash-flow segment.</p>
      </div>
    )
  }

  const visible = expanded ? filtered : filtered.slice(0, 50)
  const visibleRows = keyedTransactions(visible)

  return (
    <div className="card">
      <h2>
        {title} ({count.toLocaleString()})
      </h2>
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
          {visibleRows.map(({ transaction: t, key }) => (
            <tr key={key}>
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
