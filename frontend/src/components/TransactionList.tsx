import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  getLedgerTransactions,
  type LedgerTransactionOptions,
  ledgerTransactionsExportUrl,
  updateTransactionCategory,
} from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { CashFlowGranularity, Transaction } from '../api/types'

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface TransactionListProps {
  title?: string
  granularity?: CashFlowGranularity
  period?: string | null
  periodLabel?: string | null
  category?: string | null
}

function uniqueValues(transactions: Transaction[], key: 'category' | 'source_file') {
  return [...new Set(transactions.map((tx) => tx[key]).filter(Boolean))].sort()
}

function TransactionList({
  title,
  granularity = 'month',
  period,
  periodLabel,
  category,
}: TransactionListProps) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(category ?? '')
  const [type, setType] = useState<LedgerTransactionOptions['type']>()
  const [sourceFile, setSourceFile] = useState('')
  const [sort, setSort] = useState<LedgerTransactionOptions['sort']>('date')
  const [direction, setDirection] = useState<LedgerTransactionOptions['direction']>('asc')

  const effectiveCategory = category ?? (selectedCategory || undefined)
  const options: LedgerTransactionOptions = {
    granularity,
    period: period ?? undefined,
    category: effectiveCategory,
    type,
    sourceFile: sourceFile || undefined,
    search: search || undefined,
    sort,
    direction,
  }

  const { data } = useQuery({
    queryKey: queryKeys.ledgerTransactions(options),
    queryFn: () => getLedgerTransactions(options),
  })

  const rows = data?.transactions ?? []
  const count = data?.count ?? 0
  const visible = expanded ? rows : rows.slice(0, 50)
  const categories = useMemo(() => uniqueValues(rows, 'category'), [rows])
  const sourceFiles = useMemo(() => uniqueValues(rows, 'source_file'), [rows])

  const editMutation = useMutation({
    mutationFn: ({ id, nextCategory }: { id: string; nextCategory: string }) =>
      updateTransactionCategory(id, nextCategory),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger'] })
      queryClient.invalidateQueries({ queryKey: ['cashflow'] })
      queryClient.invalidateQueries({ queryKey: ['pnl'] })
    },
  })

  const tableTitle = title ?? `${periodLabel ?? 'Selected Period'} Transactions`
  const exportBase = {
    ...options,
    period: period ?? undefined,
  }

  if (!period && !count) return null

  return (
    <div className="card">
      <div className="transaction-list-header">
        <h2>
          {tableTitle} ({count.toLocaleString()})
        </h2>
        <div className="transaction-export-actions">
          <a
            className="ghost-button"
            href={ledgerTransactionsExportUrl({ ...exportBase, format: 'csv' })}
          >
            CSV
          </a>
          <a
            className="ghost-button"
            href={ledgerTransactionsExportUrl({ ...exportBase, format: 'xlsx' })}
          >
            XLSX
          </a>
        </div>
      </div>

      <fieldset className="transaction-filters">
        <legend className="sr-only">Transaction filters</legend>
        <input
          type="search"
          placeholder="Search transactions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value)}
          disabled={Boolean(category)}
        >
          <option value="">{category ? category : 'All categories'}</option>
          <option value="Uncategorized">Uncategorized</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={type ?? ''}
          onChange={(event) =>
            setType((event.target.value || undefined) as LedgerTransactionOptions['type'])
          }
        >
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="spending">Spending</option>
          <option value="transfer">Transfer</option>
        </select>
        <select value={sourceFile} onChange={(event) => setSourceFile(event.target.value)}>
          <option value="">All sources</option>
          {sourceFiles.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={`${sort}:${direction}`}
          onChange={(event) => {
            const [nextSort, nextDirection] = event.target.value.split(':')
            setSort(nextSort as LedgerTransactionOptions['sort'])
            setDirection(nextDirection as LedgerTransactionOptions['direction'])
          }}
        >
          <option value="date:asc">Date asc</option>
          <option value="date:desc">Date desc</option>
          <option value="amount:asc">Amount asc</option>
          <option value="amount:desc">Amount desc</option>
          <option value="category:asc">Category asc</option>
          <option value="description:asc">Description asc</option>
        </select>
      </fieldset>

      {!count ? (
        <p className="empty-state">No transactions match the active filters.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="u-text-right">Amount</th>
                <th>Category</th>
                <th className="col-source">Source</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id}>
                  <td className="u-nowrap">{t.date}</td>
                  <td>{t.description}</td>
                  <td className={`amount ${t.amount >= 0 ? 'positive' : 'negative'}`}>
                    {t.amount < 0 ? '-' : ''}
                    {fmt(t.amount)}
                  </td>
                  <td>
                    <input
                      className="transaction-category-input"
                      aria-label={`Category for ${t.description}`}
                      defaultValue={t.category}
                      onBlur={(event) => {
                        const nextCategory = event.target.value.trim()
                        if (nextCategory && nextCategory !== t.category) {
                          editMutation.mutate({ id: t.id, nextCategory })
                        }
                      }}
                    />
                    {t.category_edited && <small className="budget-hint">Session only</small>}
                  </td>
                  <td className="col-source u-muted-source">{t.source_file}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {count > 50 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="ghost-button transaction-toggle"
        >
          {expanded ? 'Show less' : `Show all ${count.toLocaleString()} transactions`}
        </button>
      )}
    </div>
  )
}

export default TransactionList
