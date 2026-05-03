import { useMemo } from 'react'
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts'
import type {
  CashFlowGranularity,
  CashFlowGroupBy,
  CashFlowNode,
  CashFlowResponse,
} from '../api/types'

const EXPENSE_COLORS = ['#f3c44d', '#f29f4a', '#e97a5f', '#dd5f93', '#9b82f2', '#5a9ef6', '#49c9ae']

function formatCurrency(value: number) {
  return `$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function colorForNode(node: CashFlowNode, expenseIndex: number) {
  if (node.type === 'income') return '#2db978'
  if (node.type === 'savings') return '#4ab8d2'
  if (node.type === 'shortfall') return '#f08a2f'
  return EXPENSE_COLORS[expenseIndex % EXPENSE_COLORS.length]
}

export interface CashFlowSegmentSelection {
  key: string
  label: string
  groupBy: CashFlowGroupBy
  granularity: CashFlowGranularity
  periodKey: string | null
}

interface CashFlowSankeyChartProps {
  data?: CashFlowResponse
  granularity: CashFlowGranularity
  groupBy: CashFlowGroupBy
  period: string
  onGranularityChange: (granularity: CashFlowGranularity) => void
  onGroupByChange: (groupBy: CashFlowGroupBy) => void
  onPeriodChange: (period: string) => void
  onSegmentSelect?: (selection: CashFlowSegmentSelection | null) => void
}

function CashFlowSankeyChart({
  data,
  granularity,
  groupBy,
  period,
  onGranularityChange,
  onGroupByChange,
  onPeriodChange,
  onSegmentSelect,
}: CashFlowSankeyChartProps) {
  const chartData = useMemo(() => {
    if (!data?.nodes.length || !data.links.length) return null

    let expenseCounter = 0
    const nodes = data.nodes.map((node) => {
      const color = colorForNode(node, expenseCounter)
      if (node.type === 'expense') expenseCounter += 1
      return {
        ...node,
        name: node.label,
        color,
      }
    })

    const indexById = new Map(nodes.map((node, index) => [node.id, index]))
    const links = data.links
      .map((link) => {
        const source = indexById.get(link.source)
        const target = indexById.get(link.target)
        if (source === undefined || target === undefined) return null
        return {
          source,
          target,
          value: link.value,
        }
      })
      .filter((link): link is { source: number; target: number; value: number } => link !== null)

    if (!links.length) return null
    return { nodes, links }
  }, [data])

  const handlePickNode = (payload: {
    type?: string
    group_key?: string | null
    label?: string
    name?: string
  }) => {
    if (payload.type !== 'expense' || !payload.group_key) {
      onSegmentSelect?.(null)
      return
    }

    onSegmentSelect?.({
      key: payload.group_key,
      label: payload.label ?? payload.name ?? payload.group_key,
      groupBy,
      granularity,
      periodKey: data?.period_key ?? null,
    })
  }

  const handleSankeyClick = (item: unknown, elementType: 'node' | 'link') => {
    if (!onSegmentSelect) return

    const typed = item as {
      payload?: {
        target?: { type?: string; group_key?: string | null; label?: string; name?: string }
        type?: string
        group_key?: string | null
        label?: string
        name?: string
      }
    }

    if (elementType === 'node' && typed.payload) {
      handlePickNode(typed.payload)
      return
    }
    if (elementType === 'link' && typed.payload?.target) {
      handlePickNode(typed.payload.target)
      return
    }
    onSegmentSelect(null)
  }

  return (
    <section className="card cashflow-card">
      <div className="cashflow-head">
        <div>
          <h2>Cash Flow Map</h2>
          <span>{data?.period_label ?? 'Latest period'}</span>
        </div>
        <div className="cashflow-controls">
          <label className="cashflow-control">
            <span>View</span>
            <select
              value={granularity}
              onChange={(event) => {
                onGranularityChange(event.target.value as CashFlowGranularity)
                onSegmentSelect?.(null)
              }}
            >
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
            </select>
          </label>
          <label className="cashflow-control">
            <span>Group By</span>
            <select
              value={groupBy}
              onChange={(event) => {
                onGroupByChange(event.target.value as CashFlowGroupBy)
                onSegmentSelect?.(null)
              }}
            >
              <option value="category">Category</option>
              <option value="merchant">Merchant</option>
            </select>
          </label>
          <label className="cashflow-control">
            <span>Period</span>
            <select
              value={period}
              onChange={(event) => {
                onPeriodChange(event.target.value)
                onSegmentSelect?.(null)
              }}
            >
              <option value="">Latest</option>
              {(data?.available_periods ?? []).map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {chartData ? (
        <>
          <ResponsiveContainer width="100%" height={360}>
            <Sankey
              data={chartData}
              nodePadding={20}
              nodeWidth={14}
              sort
              node={({ x, y, width, height, payload }) => {
                const typedPayload = payload as unknown as { color?: string; name?: string }
                return (
                  <g>
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      fill={typedPayload.color ?? '#4a9ff1'}
                      rx={2}
                    />
                    <text
                      x={x + width + 6}
                      y={y + height / 2}
                      fill="var(--text-muted)"
                      fontSize={11}
                      dominantBaseline="middle"
                    >
                      {typedPayload.name ?? ''}
                    </text>
                  </g>
                )
              }}
              link={{ stroke: '#8ebdf5', strokeOpacity: 0.35 }}
              margin={{ top: 14, right: 100, bottom: 12, left: 12 }}
              onClick={handleSankeyClick}
            >
              <Tooltip
                formatter={(rawValue: unknown) => formatCurrency(Number(rawValue))}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text)',
                }}
                itemStyle={{ color: 'var(--text)' }}
              />
            </Sankey>
          </ResponsiveContainer>

          <div className="cashflow-summary">
            <p>
              <span>Income</span>
              <strong>{formatCurrency(data?.totals.income ?? 0)}</strong>
            </p>
            <p>
              <span>Expenses</span>
              <strong>{formatCurrency(data?.totals.expenses ?? 0)}</strong>
            </p>
            <p>
              <span>{(data?.totals.net ?? 0) >= 0 ? 'Savings' : 'Shortfall'}</span>
              <strong>{formatCurrency(Math.abs(data?.totals.net ?? 0))}</strong>
            </p>
          </div>
        </>
      ) : (
        <p className="empty-state">
          Upload transactions to visualize how income flows into savings and spending.
        </p>
      )}
    </section>
  )
}

export default CashFlowSankeyChart
