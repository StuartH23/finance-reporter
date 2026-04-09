import { useQuery } from '@tanstack/react-query'
import {
  Cell,
  Pie,
  PieChart,
  type PieLabelRenderProps,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { getCategoryBreakdown } from '../api/client'
import { queryKeys } from '../api/queryKeys'

const COLORS = [
  '#00a7a2',
  '#1f7ae0',
  '#33b7f0',
  '#25c48f',
  '#f4a52c',
  '#ef7f4b',
  '#da5a6e',
  '#6b88b6',
  '#9dc0de',
  '#4cc9c2',
  '#208f8a',
  '#4f9ed9',
  '#7abf5a',
  '#be8f2c',
  '#7a90a8',
]

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface SpendingPieChartProps {
  showBreakdownTable?: boolean
}

function SpendingPieChart({ showBreakdownTable = true }: SpendingPieChartProps) {
  const { data } = useQuery({
    queryKey: queryKeys.pnl.categories,
    queryFn: getCategoryBreakdown,
  })

  const chartData = data?.spending_chart ?? []
  const categories = data?.categories ?? []

  if (!chartData.length) return null

  // Collapse small slices into "Other"
  const total = chartData.reduce((s, c) => s + c.total, 0)
  const main = chartData.filter((c) => c.total / total >= 0.02)
  const small = chartData.filter((c) => c.total / total < 0.02)
  if (small.length) {
    main.push({
      category: 'Other',
      total: small.reduce((s, c) => s + c.total, 0),
      transactions: small.reduce((s, c) => s + c.transactions, 0),
    })
  }

  return (
    <>
      <div className="card">
        <h2>Spending Profile</h2>
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={main}
              dataKey="total"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={130}
              paddingAngle={2}
              label={(props: PieLabelRenderProps & { category?: string }) =>
                `${props.category ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={false}
            >
              {main.map((_, i) => (
                <Cell
                  key={main[i].category}
                  fill={COLORS[i % COLORS.length]}
                  stroke="var(--bg)"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(val) => fmt(Number(val))}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
              }}
              itemStyle={{ color: 'var(--text)' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {showBreakdownTable && categories.length > 0 && (
        <div className="card">
          <h2>Category Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Income</th>
                <th style={{ textAlign: 'right' }}>Expenses</th>
                <th style={{ textAlign: 'right' }}>Net</th>
                <th style={{ textAlign: 'right' }}>Txns</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td className="amount positive">{fmt(c.income)}</td>
                  <td className="amount negative">{fmt(c.expenses)}</td>
                  <td className={`amount ${c.net >= 0 ? 'positive' : 'negative'}`}>
                    {c.net >= 0 ? '' : '-'}
                    {fmt(c.net)}
                  </td>
                  <td className="amount">{c.transactions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default SpendingPieChart
