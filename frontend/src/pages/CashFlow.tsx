import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCashFlow, getSubscriptions } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type {
  CashFlowGranularity,
  CashFlowGroup,
  CashFlowGroupBy,
  CashFlowResponse,
  SubscriptionItem,
} from '../api/types'
import type { CashFlowSegmentSelection } from '../components/CashFlowSankeyChart'
import CashFlowSankeyChart from '../components/CashFlowSankeyChart'
import InsightsPanel from '../components/InsightsPanel'
import SpendingPieChart from '../components/SpendingPieChart'
import TransactionList from '../components/TransactionList'

function formatCurrency(value: number) {
  const prefix = value < 0 ? '-' : ''
  return `${prefix}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function formatDelta(value: number, suffix = '') {
  if (Math.abs(value) < 0.005) return `No change${suffix}`
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}${suffix}`
}

function groupMap(data?: CashFlowResponse) {
  return new Map((data?.groups ?? []).map((group) => [group.key, group]))
}

function previousPeriodKey(data?: CashFlowResponse) {
  if (!data?.period_key) return null
  const index = data.available_periods.findIndex((period) => period.key === data.period_key)
  if (index < 0) return null
  return data.available_periods[index + 1]?.key ?? null
}

function buildCashFlowVerdict(
  groups: { label: string; amount: number }[],
  totalExpenses: number,
  periodLabel: string | null,
): string {
  const spendingGroups = groups.filter((g) => g.amount > 0).sort((a, b) => b.amount - a.amount)
  if (spendingGroups.length === 0) {
    return 'Cash flow is ready once spending data is available.'
  }
  const period = periodLabel ?? 'this period'
  if (spendingGroups.length === 1) {
    const pct = totalExpenses > 0 ? Math.round((spendingGroups[0].amount / totalExpenses) * 100) : 0
    return `Most spending in ${period} went to ${spendingGroups[0].label} - ${pct}% of outflows.`
  }
  const top = spendingGroups[0]
  const second = spendingGroups[1]
  const combined = top.amount + second.amount
  const pct = totalExpenses > 0 ? Math.round((combined / totalExpenses) * 100) : 0
  return `Most spending in ${period} went to ${top.label} and ${second.label} - together ${pct}% of outflows.`
}

function KpiStrip({ data, previous }: { data?: CashFlowResponse; previous?: CashFlowResponse }) {
  const savingsRate = data?.totals.income ? (data.totals.net / data.totals.income) * 100 : 0
  const previousSavingsRate = previous?.totals.income
    ? (previous.totals.net / previous.totals.income) * 100
    : null
  const kpis = [
    {
      label: 'Net cash flow',
      value: formatCurrency(data?.totals.net ?? 0),
      delta:
        data && previous ? formatDelta(data.totals.net - previous.totals.net) : 'No comparison',
    },
    {
      label: 'Income',
      value: formatCurrency(data?.totals.income ?? 0),
      delta:
        data && previous
          ? formatDelta(data.totals.income - previous.totals.income)
          : 'No comparison',
    },
    {
      label: 'Spending',
      value: formatCurrency(data?.totals.expenses ?? 0),
      delta:
        data && previous
          ? formatDelta(data.totals.expenses - previous.totals.expenses)
          : 'No comparison',
    },
    {
      label: 'Savings rate',
      value: formatPercent(savingsRate),
      delta:
        previousSavingsRate === null
          ? 'No comparison'
          : `${Math.round(savingsRate - previousSavingsRate)} pts`,
    },
    {
      label: 'Transfers',
      value: formatCurrency(data?.totals.transfers ?? 0),
      delta:
        data && previous
          ? formatDelta((data.totals.transfers ?? 0) - (previous.totals.transfers ?? 0))
          : 'No comparison',
    },
    {
      label: 'Transactions',
      value: (data?.transaction_count ?? 0).toLocaleString(),
      delta:
        data && previous
          ? `${data.transaction_count - previous.transaction_count >= 0 ? '+' : ''}${data.transaction_count - previous.transaction_count}`
          : 'No comparison',
    },
  ]

  return (
    <section className="cashflow-kpi-strip" aria-label="Cash flow summary">
      {kpis.map((kpi) => (
        <article className="cashflow-kpi" key={kpi.label}>
          <span>{kpi.label}</span>
          <strong>{kpi.value}</strong>
          <small>{kpi.delta}</small>
        </article>
      ))}
    </section>
  )
}

function PeriodControls({
  data,
  granularity,
  period,
  onGranularityChange,
  onPeriodChange,
}: {
  data?: CashFlowResponse
  granularity: CashFlowGranularity
  period: string
  onGranularityChange: (granularity: CashFlowGranularity) => void
  onPeriodChange: (period: string) => void
}) {
  return (
    <section className="cashflow-period-panel" aria-label="Cash flow period controls">
      <label className="cashflow-control">
        <span>Scope</span>
        <select
          value={granularity}
          onChange={(event) => onGranularityChange(event.target.value as CashFlowGranularity)}
        >
          <option value="month">Month</option>
          <option value="quarter">Quarter</option>
          <option value="year">Year</option>
        </select>
      </label>
      <label className="cashflow-control">
        <span>Period</span>
        <select value={period} onChange={(event) => onPeriodChange(event.target.value)}>
          <option value="">Latest</option>
          {(data?.available_periods ?? []).map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}

function CashFlowWaterfall({ data }: { data?: CashFlowResponse }) {
  const income = data?.totals.income ?? 0
  const expenses = data?.totals.expenses ?? 0
  const net = data?.totals.net ?? 0
  const max = Math.max(income, expenses, Math.abs(net), 1)
  const bars = [
    { label: 'Income', value: income, tone: 'positive' },
    { label: 'Spending', value: expenses, tone: 'negative' },
    {
      label: net >= 0 ? 'Net saved' : 'Shortfall',
      value: Math.abs(net),
      tone: net >= 0 ? 'positive' : 'negative',
    },
  ]

  return (
    <section className="card cashflow-waterfall-card">
      <div className="insights-header-row">
        <h2>Cash Flow Waterfall</h2>
        <span className="budget-hint">{data?.period_label ?? 'Latest period'}</span>
      </div>
      <div className="cashflow-waterfall">
        {bars.map((bar) => (
          <div className="cashflow-waterfall-row" key={bar.label}>
            <span>{bar.label}</span>
            <div className="cashflow-waterfall-track">
              <div
                className={`cashflow-waterfall-bar ${bar.tone}`}
                style={{ width: `${Math.max(4, (bar.value / max) * 100)}%` }}
              />
            </div>
            <strong>{formatCurrency(bar.value)}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function WhereCashWentTable({
  data,
  previous,
  selection,
  onSelect,
}: {
  data?: CashFlowResponse
  previous?: CashFlowResponse
  selection: CashFlowSegmentSelection | null
  onSelect: (selection: CashFlowSegmentSelection) => void
}) {
  const previousGroups = useMemo(() => groupMap(previous), [previous])
  const groups = [...(data?.groups ?? [])].sort((a, b) => b.amount - a.amount)

  return (
    <section className="card">
      <div className="insights-header-row">
        <h2>Where Cash Went</h2>
        <span className="budget-hint">{data?.period_label ?? 'Latest period'}</span>
      </div>
      {!groups.length ? (
        <p className="empty-state">No spending groups in this period.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{data?.group_by === 'merchant' ? 'Merchant' : 'Category'}</th>
                <th className="u-text-right">Amount</th>
                <th className="u-text-right">Outflows</th>
                <th className="u-text-right">Txns</th>
                <th className="u-text-right">Previous</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const pct = data?.totals.expenses ? (group.amount / data.totals.expenses) * 100 : 0
                const isSelected = selection?.key === group.key
                const previousAmount = previousGroups.get(group.key)?.amount ?? 0
                return (
                  <tr key={group.key} className={isSelected ? 'cashflow-row-selected' : undefined}>
                    <td>
                      <button
                        type="button"
                        className="cashflow-row-button"
                        onClick={() =>
                          onSelect({
                            key: group.key,
                            label: group.label,
                            groupBy: data?.group_by ?? 'category',
                            granularity: data?.granularity ?? 'month',
                            periodKey: data?.period_key ?? null,
                          })
                        }
                      >
                        {group.label}
                      </button>
                    </td>
                    <td className="amount negative">{formatCurrency(group.amount)}</td>
                    <td className="u-text-right">{formatPercent(pct)}</td>
                    <td className="u-text-right">{group.transactions.toLocaleString()}</td>
                    <td className="u-text-right">
                      {previous ? formatDelta(group.amount - previousAmount) : 'No comparison'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function SelectedSegmentPanel({
  group,
  previousGroup,
  totalExpenses,
  selection,
  onClear,
}: {
  group?: CashFlowGroup
  previousGroup?: CashFlowGroup
  totalExpenses: number
  selection: CashFlowSegmentSelection | null
  onClear: () => void
}) {
  if (!selection) return null
  const amount = group?.amount ?? 0
  const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0

  return (
    <section className="card cashflow-selected-panel">
      <div className="insights-header-row">
        <div>
          <h2>Selected Segment</h2>
          <p className="budget-hint u-mb-0">
            {selection.label} by {selection.groupBy}
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={onClear}>
          Clear Filter
        </button>
      </div>
      <div className="cashflow-selected-grid">
        <p>
          <span>Amount</span>
          <strong>{formatCurrency(amount)}</strong>
        </p>
        <p>
          <span>Outflows</span>
          <strong>{formatPercent(pct)}</strong>
        </p>
        <p>
          <span>Transactions</span>
          <strong>{(group?.transactions ?? 0).toLocaleString()}</strong>
        </p>
        <p>
          <span>Previous</span>
          <strong>
            {previousGroup ? formatDelta(amount - previousGroup.amount) : 'No comparison'}
          </strong>
        </p>
      </div>
      {!group && <p className="empty-state">This segment is not present in the selected period.</p>}
    </section>
  )
}

function RecurringChargesModule({ subscriptions }: { subscriptions: SubscriptionItem[] }) {
  const rows = subscriptions
    .filter((item) => item.active && item.next_due_date)
    .sort((a, b) => (a.next_due_date ?? '').localeCompare(b.next_due_date ?? ''))
    .slice(0, 5)

  return (
    <section className="card cashflow-recurring-card">
      <div className="insights-header-row">
        <h2>Detected Recurring Charges</h2>
        <Link to="/subscriptions" className="ghost-button">
          Review
        </Link>
      </div>
      {!rows.length ? (
        <p className="empty-state">No active upcoming recurring charges detected.</p>
      ) : (
        <div className="cashflow-recurring-list">
          {rows.map((item) => (
            <article key={item.stream_id} className="cashflow-recurring-row">
              <div>
                <strong>{item.merchant}</strong>
                <span>{item.next_due_date}</span>
              </div>
              <div>
                <strong>{formatCurrency(item.expected_amount ?? item.amount)}</strong>
                <span className="cashflow-badge">
                  {item.payment_state ?? item.status_group ?? 'active'}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function CashFlow() {
  const [granularity, setGranularity] = useState<CashFlowGranularity>('month')
  const [groupBy, setGroupBy] = useState<CashFlowGroupBy>('category')
  const [period, setPeriod] = useState('')
  const [selection, setSelection] = useState<CashFlowSegmentSelection | null>(null)

  const { data: cashFlowData } = useQuery({
    queryKey: queryKeys.cashflow.byParams({ granularity, groupBy, period: period || undefined }),
    queryFn: () => getCashFlow({ granularity, groupBy, period: period || undefined }),
  })

  const priorPeriod = previousPeriodKey(cashFlowData)
  const { data: previousCashFlowData } = useQuery({
    queryKey: queryKeys.cashflow.byParams({
      granularity,
      groupBy,
      period: priorPeriod ?? undefined,
    }),
    queryFn: () => getCashFlow({ granularity, groupBy, period: priorPeriod ?? undefined }),
    enabled: Boolean(priorPeriod),
  })

  const { data: recurringData } = useQuery({
    queryKey: queryKeys.subscriptions.upcoming({ statusGroup: 'active', limit: 5 }),
    queryFn: () =>
      getSubscriptions({
        status: 'active',
        view: 'upcoming',
        statusGroup: 'active',
        sort: 'due_asc',
        page: 1,
        pageSize: 5,
      }),
  })

  useEffect(() => {
    if (!period || !cashFlowData) return
    if (!cashFlowData.available_periods.some((item) => item.key === period)) {
      setPeriod('')
      setSelection(null)
    }
  }, [cashFlowData, period])

  useEffect(() => {
    if (!selection || !cashFlowData) return
    if (
      selection.groupBy !== cashFlowData.group_by ||
      selection.granularity !== cashFlowData.granularity ||
      selection.periodKey !== cashFlowData.period_key ||
      !cashFlowData.groups.some((group) => group.key === selection.key)
    ) {
      setSelection(null)
    }
  }, [cashFlowData, selection])

  const currentGroups = useMemo(() => groupMap(cashFlowData), [cashFlowData])
  const previousGroups = useMemo(() => groupMap(previousCashFlowData), [previousCashFlowData])
  const selectedGroup = selection ? currentGroups.get(selection.key) : undefined
  const previousSelectedGroup = selection ? previousGroups.get(selection.key) : undefined

  const verdict = cashFlowData
    ? buildCashFlowVerdict(
        cashFlowData.groups,
        cashFlowData.totals.expenses,
        cashFlowData.period_label,
      )
    : null

  return (
    <div className="dashboard-page">
      <h1 className="page-title">{cashFlowData?.period_label ?? 'Latest Period'} Cash Flow</h1>
      {verdict && <p className="page-subtitle">{verdict}</p>}
      <PeriodControls
        data={cashFlowData}
        granularity={granularity}
        period={period}
        onGranularityChange={(next) => {
          setGranularity(next)
          setPeriod('')
          setSelection(null)
        }}
        onPeriodChange={(next) => {
          setPeriod(next)
          setSelection(null)
        }}
      />

      <KpiStrip data={cashFlowData} previous={previousCashFlowData} />

      <div className="dashboard-layout">
        <div className="dashboard-main-column">
          <CashFlowWaterfall data={cashFlowData} />
          <WhereCashWentTable
            data={cashFlowData}
            previous={previousCashFlowData}
            selection={selection}
            onSelect={setSelection}
          />
          <CashFlowSankeyChart
            data={cashFlowData}
            granularity={granularity}
            groupBy={groupBy}
            period={period}
            onGranularityChange={(next) => {
              setGranularity(next)
              setPeriod('')
              setSelection(null)
            }}
            onGroupByChange={(next) => {
              setGroupBy(next)
              setSelection(null)
            }}
            onPeriodChange={(next) => {
              setPeriod(next)
              setSelection(null)
            }}
            onSegmentSelect={setSelection}
          />
          <SelectedSegmentPanel
            group={selectedGroup}
            previousGroup={previousSelectedGroup}
            totalExpenses={cashFlowData?.totals.expenses ?? 0}
            selection={selection}
            onClear={() => setSelection(null)}
          />
          <TransactionList
            title={`${cashFlowData?.period_label ?? 'Latest Period'} Transactions`}
            granularity={cashFlowData?.granularity ?? granularity}
            period={cashFlowData?.period_key ?? period}
            periodLabel={cashFlowData?.period_label}
            category={selection?.groupBy === 'category' ? selection.key : null}
          />
        </div>
        <aside className="dashboard-side-column">
          <RecurringChargesModule subscriptions={recurringData?.subscriptions ?? []} />
          <InsightsPanel />
          <SpendingPieChart showBreakdownTable={false} />
        </aside>
      </div>
    </div>
  )
}

export default CashFlow
