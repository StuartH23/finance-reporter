import { useQuery } from '@tanstack/react-query'
import { getCategoryBreakdown, getMonthlyPnl } from '../api/client'
import { queryKeys } from '../api/queryKeys'

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
    queryFn: getCategoryBreakdown,
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

  const investmentFromCategory =
    categoryData?.categories
      ?.filter((item) => item.category.toLowerCase().includes('invest'))
      .reduce((sum, item) => sum + Math.max(0, item.expenses), 0) ?? 0

  const cards = [
    {
      key: 'earnings',
      label: 'Total Earnings',
      value: latest.income,
      delta: pctChange(latest.income, previous?.income ?? latest.income),
      icon: 'IN',
    },
    {
      key: 'spendings',
      label: 'Total Spendings',
      value: latest.expenses,
      delta: pctChange(latest.expenses, previous?.expenses ?? latest.expenses),
      icon: 'SP',
    },
    {
      key: 'savings',
      label: 'Total Savings',
      value: Math.max(0, latest.net),
      delta: pctChange(Math.max(0, latest.net), Math.max(0, previous?.net ?? latest.net)),
      icon: 'SV',
    },
    {
      key: 'investment',
      label: 'Total Investment',
      value: investmentFromCategory,
      delta: 0,
      icon: 'IV',
    },
  ]

  return (
    <section className="dashboard-kpis">
      {cards.map((card) => {
        const positive = card.delta >= 0
        return (
          <article key={card.key} className="kpi-card">
            <div className="kpi-head">
              <p>{card.label}</p>
              <span className="kpi-icon">{card.icon}</span>
            </div>
            <p className="kpi-value">{fmt(card.value)}</p>
            <div className="kpi-foot">
              <span className={`kpi-pill ${positive ? 'positive' : 'negative'}`}>
                {positive ? '+' : ''}
                {Math.abs(card.delta).toFixed(1)}%
              </span>
              <span>from last month</span>
            </div>
          </article>
        )
      })}
    </section>
  )
}

export default DashboardKpis
