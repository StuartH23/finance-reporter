import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import type { SpendingChartItem } from '../api/types'

const CATEGORY_COLORS = [
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
const OTHER_COLOR = '#6b88b6'

const CHART_HEIGHT = 318
const CHART_MARGIN = { top: 22, right: 56, bottom: 22, left: 56 }
const CHART_COMPACT_HEIGHT = 252
const CHART_COMPACT_MARGIN = { top: 12, right: 12, bottom: 12, left: 12 }
const CHART_STACKED_HEIGHT = 262
const MIN_SIDE_BY_SIDE_WIDTH = 470
const MIN_SLICE_SHARE = 0.025
const MIN_LABEL_SHARE = 0.08
const MIN_LABEL_WIDTH = 680
const LABEL_PADDING = 8
const LABEL_CHAR_WIDTH = 0.56

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pct(share: number) {
  return `${Math.max(1, Math.round(share * 100))}%`
}

interface SpendingPieChartProps {
  showBreakdownTable?: boolean
  year?: number | null
}

interface SpendingSlice {
  category: string
  total: number
  share: number
}

function hashCategory(category: string) {
  let hash = 0
  for (let i = 0; i < category.length; i += 1) {
    hash = (hash << 5) - hash + category.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function colorForCategory(category: string) {
  if (category === 'Other') return OTHER_COLOR
  return CATEGORY_COLORS[hashCategory(category) % CATEGORY_COLORS.length]
}

function summarizeSpending(chartItems: SpendingChartItem[]) {
  if (!chartItems.length) return null

  const sorted = [...chartItems].filter((item) => item.total > 0).sort((a, b) => b.total - a.total)
  const total = sorted.reduce((sum, item) => sum + item.total, 0)

  if (total <= 0) return null

  const large = sorted.filter((item) => item.total / total >= MIN_SLICE_SHARE)
  const small = sorted.filter((item) => item.total / total < MIN_SLICE_SHARE)

  const slices: SpendingSlice[] = large.map((item) => ({
    category: item.category,
    total: item.total,
    share: item.total / total,
  }))

  if (small.length) {
    slices.push({
      category: 'Other',
      total: small.reduce((sum, item) => sum + item.total, 0),
      share: small.reduce((sum, item) => sum + item.total, 0) / total,
    })
  }

  slices.sort((a, b) => b.total - a.total)
  const topCategory = slices[0]

  const otherBreakdown = small
    .map((item) => ({
      category: item.category,
      percent: pct(item.total / total),
      total: item.total,
    }))
    .sort((a, b) => b.total - a.total)

  return {
    total,
    slices,
    topCategory,
    topThreeShare: sorted.slice(0, 3).reduce((sum, item) => sum + item.total, 0) / total,
    categoryCount: sorted.length,
    rolledCategoryCount: small.length,
    otherBreakdown,
    otherTotal: otherBreakdown.reduce((sum, item) => sum + item.total, 0),
  }
}

function SpendingPieChart({ showBreakdownTable = true, year }: SpendingPieChartProps) {
  const profileVisualRef = useRef<HTMLDivElement>(null)
  const [profileWidth, setProfileWidth] = useState(0)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  useEffect(() => {
    const element = profileVisualRef.current
    if (!element) return

    const updateWidth = () => setProfileWidth(Math.round(element.getBoundingClientRect().width))
    updateWidth()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateWidth())
      observer.observe(element)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const { data } = useQuery({
    queryKey: queryKeys.pnl.categoriesByYear(year),
    queryFn: () => getCategoryBreakdown({ year: year ?? undefined }),
  })

  const chartData = data?.spending_chart ?? []
  const categories = data?.categories ?? []

  const prepared = useMemo(() => summarizeSpending(chartData), [chartData])
  if (!prepared) return null

  const {
    total,
    slices,
    topCategory,
    topThreeShare,
    categoryCount,
    rolledCategoryCount,
    otherBreakdown,
    otherTotal,
  } = prepared

  const labelFontSize =
    profileWidth > 0 ? Math.max(10, Math.min(13, Math.round(profileWidth / 70))) : 11
  const isStacked = profileWidth > 0 && profileWidth < MIN_SIDE_BY_SIDE_WIDTH
  const showOuterLabels = profileWidth >= MIN_LABEL_WIDTH
  const chartHeight = showOuterLabels
    ? CHART_HEIGHT
    : isStacked
      ? CHART_STACKED_HEIGHT
      : CHART_COMPACT_HEIGHT
  const chartMargin = showOuterLabels ? CHART_MARGIN : CHART_COMPACT_MARGIN
  const innerRadius = showOuterLabels ? 72 : 58
  const outerRadius = showOuterLabels ? '72%' : '88%'
  const layoutClassName = `spending-profile-visual ${isStacked ? 'stacked' : ''} ${
    showOuterLabels ? 'with-labels' : 'without-labels'
  }`

  const shouldRenderLabel = (share: number) => showOuterLabels && share >= MIN_LABEL_SHARE

  const renderPrimaryLabels = (props: PieLabelRenderProps & { category?: string }) => {
    const category = props.category ?? ''
    const share = Number(
      (props.payload as { share?: number } | undefined)?.share ?? props.percent ?? 0,
    )
    if (!shouldRenderLabel(share)) return null
    const text = `${category} ${pct(share)}`
    const width = profileWidth || 680
    const left = CHART_MARGIN.left + 4
    const right = width - CHART_MARGIN.right - 4
    const top = chartMargin.top + 4
    const bottom = chartHeight - chartMargin.bottom - 4
    const rawX = Number(props.x ?? 0)
    const rawY = Number(props.y ?? 0)
    const anchor = props.textAnchor === 'end' ? 'end' : 'start'
    const estimatedWidth = text.length * labelFontSize * LABEL_CHAR_WIDTH
    let x = rawX
    if (anchor === 'start') {
      x = Math.min(x, right - estimatedWidth - LABEL_PADDING)
      x = Math.max(x, left + LABEL_PADDING)
    } else {
      x = Math.max(x, left + estimatedWidth + LABEL_PADDING)
      x = Math.min(x, right - LABEL_PADDING)
    }
    const y = Math.max(top + LABEL_PADDING, Math.min(rawY, bottom - LABEL_PADDING))

    return (
      <text
        x={x}
        y={y}
        className="spending-pie-label"
        textAnchor={anchor}
        dominantBaseline="central"
        fontSize={labelFontSize}
      >
        {text}
      </text>
    )
  }

  return (
    <>
      <div className="card">
        <h2>Spending Profile{year !== null && year !== undefined ? ` (${year})` : ''}</h2>
        <div className="spending-profile-summary">
          <div className="spending-summary-chip primary">
            <span className="spending-summary-label">Top category</span>
            <span className="spending-summary-value">{topCategory.category}</span>
            <span className="spending-summary-detail">
              {fmt(topCategory.total)} / {pct(topCategory.share)} of spend
            </span>
          </div>
          <div className="spending-summary-chip">
            <span className="spending-summary-label">Top 3 concentration</span>
            <span className="spending-summary-value">{pct(topThreeShare)}</span>
            <span className="spending-summary-detail">of spending sits in three categories</span>
          </div>
          <div className="spending-summary-chip">
            <span className="spending-summary-label">Category breadth</span>
            <span className="spending-summary-value">{categoryCount}</span>
            <span className="spending-summary-detail">
              {rolledCategoryCount > 0
                ? `${rolledCategoryCount} grouped into Other`
                : 'no tiny categories grouped'}
            </span>
          </div>
        </div>
        <div className="spending-profile-body">
          <div ref={profileVisualRef} className={layoutClassName}>
            <div
              className="spending-profile-chart-shell"
              style={{ minHeight: chartHeight }}
              role="img"
              aria-label={`Spending donut chart. Total spending ${fmt(total)}. Top category ${topCategory.category} at ${Math.round(topCategory.share * 100)} percent.`}
            >
              <ResponsiveContainer width="100%" height={chartHeight}>
                <PieChart margin={chartMargin} accessibilityLayer={false}>
                  <Pie
                    data={slices}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={innerRadius}
                    outerRadius={outerRadius}
                    paddingAngle={2}
                    rootTabIndex={-1}
                    label={renderPrimaryLabels}
                    labelLine={showOuterLabels}
                    onMouseEnter={(_, index) => {
                      const hovered = slices[index]
                      if (hovered) setActiveCategory(hovered.category)
                    }}
                    onMouseLeave={() => setActiveCategory(null)}
                  >
                    {slices.map((item) => (
                      <Cell
                        key={item.category}
                        fill={colorForCategory(item.category)}
                        stroke="var(--surface)"
                        strokeWidth={activeCategory === item.category ? 3 : 2}
                        fillOpacity={activeCategory && activeCategory !== item.category ? 0.42 : 1}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: unknown) => fmt(Number(val))}
                    cursor={false}
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                    }}
                    itemStyle={{ color: 'var(--text)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="spending-donut-center" aria-hidden="true">
                <p className="spending-donut-center-kicker">Total Spend</p>
                <p className="spending-donut-center-total">{fmt(total)}</p>
                <p className="spending-donut-center-top">
                  {topCategory.category} {pct(topCategory.share)}
                </p>
              </div>
            </div>
            <ul className="spending-profile-legend" aria-label="Spending category shares">
              {slices.map((item) => (
                <li key={item.category}>
                  <button
                    type="button"
                    className={`spending-legend-item ${
                      item.category === topCategory.category ? 'dominant' : ''
                    } ${activeCategory === item.category ? 'active' : ''} ${
                      activeCategory && activeCategory !== item.category ? 'muted' : ''
                    }`}
                    onMouseEnter={() => setActiveCategory(item.category)}
                    onMouseLeave={() => setActiveCategory(null)}
                    onFocus={() => setActiveCategory(item.category)}
                    onBlur={() => setActiveCategory(null)}
                    aria-label={`${item.category}, ${pct(item.share)}, ${fmt(item.total)}`}
                  >
                    <span
                      className="spending-legend-share"
                      style={{
                        backgroundColor: colorForCategory(item.category),
                        width: `${Math.max(4, Math.round(item.share * 100))}%`,
                      }}
                      aria-hidden="true"
                    />
                    <span
                      className="spending-legend-dot"
                      style={{ backgroundColor: colorForCategory(item.category) }}
                      aria-hidden="true"
                    />
                    <span className="spending-legend-name">{item.category}</span>
                    <span className="spending-legend-metric">{fmt(item.total)}</span>
                    <span className="spending-legend-percent">{pct(item.share)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {otherBreakdown.length > 0 && (
            <div
              className={`spending-other-breakdown ${activeCategory === 'Other' ? 'active' : ''}`}
            >
              <div className="spending-other-breakdown-heading">
                <p className="spending-other-breakdown-title">
                  Other includes{' '}
                  <span className="spending-other-breakdown-total">{fmt(otherTotal)}</span>
                </p>
                <span className="spending-other-breakdown-count">
                  {rolledCategoryCount} grouped
                </span>
              </div>
              <ul className="spending-other-breakdown-list">
                {otherBreakdown.map((item) => (
                  <li key={item.category} className="spending-other-breakdown-item">
                    <span className="spending-other-breakdown-name">{item.category}</span>
                    <span className="spending-other-breakdown-metrics">
                      <span className="spending-other-breakdown-value">{fmt(item.total)}</span>
                      <span className="spending-other-breakdown-percent">{item.percent}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {showBreakdownTable && categories.length > 0 && (
        <div className="card">
          <h2>Category Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="u-text-right">Income</th>
                <th className="u-text-right">Expenses</th>
                <th className="u-text-right">Net</th>
                <th className="u-text-right">Txns</th>
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
