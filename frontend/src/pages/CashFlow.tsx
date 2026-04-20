import { useState } from 'react'
import type { CashFlowSegmentSelection } from '../components/CashFlowSankeyChart'
import CashFlowSankeyChart from '../components/CashFlowSankeyChart'
import InsightsPanel from '../components/InsightsPanel'
import SpendingPieChart from '../components/SpendingPieChart'
import TransactionList from '../components/TransactionList'

function CashFlow() {
  const [selection, setSelection] = useState<CashFlowSegmentSelection | null>(null)

  return (
    <div className="dashboard-page">
      <h1 className="page-title">Cash Flow</h1>
      <p className="page-subtitle">
        Follow how money moves from income into savings and spending categories so you can quickly
        spot where to optimize.
      </p>

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
              <p className="budget-hint" style={{ marginBottom: 0 }}>
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
