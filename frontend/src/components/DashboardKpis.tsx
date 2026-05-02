import { useQuery } from '@tanstack/react-query'
import { getCategoryBreakdown, getMonthlyPnl } from '../api/client'
import { queryKeys } from '../api/queryKeys'

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function toMonthDate(monthStr: string) {
  const parsed = new Date(`${monthStr} 1`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function pctChange(current: number, previous: number) {
  if (Math.abs(previous) < 0.0001) return 0
  return ((current - previous) / Math.abs(previous)) * 100
}

function DashboardKpis() {
  const { data: monthlyData } = useQuery({
    queryKey: queryKeys.pnl.monthly,
    queryFn: getMonthlyPnl,
  })

  const { data: categoryData } = useQuery({
    queryKey: queryKeys.pnl.categories,
    queryFn: () => getCategoryBreakdown(),
  })

  const sortedMonths = [...(monthlyData?.months ?? [])].sort((a, b) => {
    const da = toMonthDate(a.month_str)
    const db = toMonthDate(b.month_str)
    if (!da || !db) return 0
    return da.getTime() - db.getTime()
  })

  const latest = sortedMonths[sortedMonths.length - 1]
  const previous = sortedMonths[sortedMonths.length - 2]

  if (!latest) return null

  const topSpendingCategory = [...(categoryData?.spending_chart ?? [])].sort(
    (a, b) => b.total - a.total,
  )[0]

  const cards = [
    {
      key: 'earnings',
      label: 'Income',
      value: latest.income,
      delta: pctChange(latest.income, previous?.income ?? latest.income),
    },
    {
      key: 'spendings',
      label: 'Spending',
      value: latest.expenses,
      delta: pctChange(latest.expenses, previous?.expenses ?? latest.expenses),
    },
    {
      key: 'savings',
      label: 'Net Savings',
      value: Math.max(0, latest.net),
      delta: pctChange(Math.max(0, latest.net), Math.max(0, previous?.net ?? latest.net)),
    },
    {
      key: 'largest-category',
      label: topSpendingCategory?.category ?? 'Largest Category',
      value: topSpendingCategory?.total ?? 0,
      delta: 0,
    },
  ]

  return (
    <section className="kpi-strip" aria-label="What changed">
      {cards.map((card) => {
        const positive = card.delta >= 0
        return (
          <div key={card.key} className="kpi-stat">
            <span className="kpi-stat-label">{card.label}</span>
            <span className="kpi-stat-value">{fmt(card.value)}</span>
            <span className={`kpi-stat-delta ${positive ? 'pos' : 'neg'}`}>
              {positive ? '+' : ''}
              {Math.abs(card.delta).toFixed(1)}%<span> vs last month</span>
            </span>
          </div>
        )
      })}
    </section>
  )
}

export default DashboardKpis
