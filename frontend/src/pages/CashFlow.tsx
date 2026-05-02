import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getCashFlow } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import type { CashFlowSegmentSelection } from '../components/CashFlowSankeyChart'
import CashFlowSankeyChart from '../components/CashFlowSankeyChart'
import InsightsPanel from '../components/InsightsPanel'
import SpendingPieChart from '../components/SpendingPieChart'
import TransactionList from '../components/TransactionList'

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
    return `Most spending in ${period} went to ${spendingGroups[0].label} — ${pct}% of outflows.`
  }
  const top = spendingGroups[0]
  const second = spendingGroups[1]
  const combined = top.amount + second.amount
  const pct = totalExpenses > 0 ? Math.round((combined / totalExpenses) * 100) : 0
  return `Most spending in ${period} went to ${top.label} and ${second.label} — together ${pct}% of outflows.`
}

function CashFlow() {
  const [selection, setSelection] = useState<CashFlowSegmentSelection | null>(null)

  const { data: cashFlowData } = useQuery({
    queryKey: queryKeys.cashflow.byParams(),
    queryFn: () => getCashFlow(),
  })

  const verdict = cashFlowData
    ? buildCashFlowVerdict(
        cashFlowData.groups,
        cashFlowData.totals.expenses,
        cashFlowData.period_label,
      )
    : null

  return (
    <div className="dashboard-page">
      <h1 className="page-title">Cash Flow</h1>
      {verdict && <p className="page-subtitle">{verdict}</p>}

      <div className="dashboard-layout">
        <div className="dashboard-main-column">
          <CashFlowSankeyChart onSegmentSelect={setSelection} />
          {selection && (
            <div className="card">
              <div className="insights-header-row">
                <h2>Segment Drill-Down</h2>
                <button type="button" className="ghost-button" onClick={() => setSelection(null)}>
                  Clear Filter
                </button>
              </div>
              <p className="budget-hint u-mb-0">
                Viewing <strong>{selection.label}</strong> by {selection.groupBy} for{' '}
                {selection.periodKey ?? 'latest'}.
              </p>
            </div>
          )}
          <TransactionList
            title={selection ? 'Filtered Transactions' : 'Transactions'}
            filters={
              selection
                ? {
                    granularity: selection.granularity,
                    periodKey: selection.periodKey,
                    category: selection.groupBy === 'category' ? selection.key : null,
                    merchant: selection.groupBy === 'merchant' ? selection.key : null,
                  }
                : undefined
            }
          />
        </div>
        <aside className="dashboard-side-column">
          <InsightsPanel />
          <SpendingPieChart showBreakdownTable={false} />
        </aside>
      </div>
    </div>
  )
}

export default CashFlow
