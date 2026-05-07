import type { LedgerResponse, MonthlyPnlResponse } from '../api/types'

interface DashboardCommandHeaderProps {
  demoModeEnabled: boolean
  ledgerData?: LedgerResponse
  monthlyData?: MonthlyPnlResponse
  canUpload?: boolean
  onUploadStatements: () => void
}

function toMonthDate(monthStr: string) {
  const parsed = new Date(`${monthStr} 1`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function latestMonthLabel(monthlyData?: MonthlyPnlResponse) {
  const latest = [...(monthlyData?.months ?? [])]
    .sort((a, b) => {
      const da = toMonthDate(a.month_str)
      const db = toMonthDate(b.month_str)
      if (!da || !db) return 0
      return da.getTime() - db.getTime()
    })
    .at(-1)

  return latest?.month_str ?? 'No period yet'
}

function uniqueSourceCount(ledgerData?: LedgerResponse) {
  const sourceFiles = new Set(
    (ledgerData?.transactions ?? []).map((transaction) => transaction.source_file).filter(Boolean),
  )
  return sourceFiles.size
}

export default function DashboardCommandHeader({
  demoModeEnabled,
  ledgerData,
  monthlyData,
  canUpload = true,
  onUploadStatements,
}: DashboardCommandHeaderProps) {
  const transactionCount = ledgerData?.count ?? 0
  const sourceCount = uniqueSourceCount(ledgerData)
  const sourceLabel =
    sourceCount > 0
      ? `${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`
      : demoModeEnabled
        ? 'Sample data'
        : 'No sources'

  return (
    <section className="dashboard-command-header" aria-labelledby="money-checkup-title">
      <div className="dashboard-command-title">
        <h1 id="money-checkup-title">Money Checkup</h1>
      </div>

      <div className="dashboard-status-row">
        <span>{latestMonthLabel(monthlyData)}</span>
        <span>{demoModeEnabled ? 'Demo' : 'Live'}</span>
        <span>{transactionCount.toLocaleString()} transactions</span>
        <span>{sourceLabel}</span>
        {canUpload && (
          <button type="button" className="ghost-button" onClick={onUploadStatements}>
            Upload
          </button>
        )}
        {!canUpload && demoModeEnabled && (
          <span className="dashboard-upload-hint" title="Sign in to upload personal statements">
            Sign in to upload
          </span>
        )}
      </div>
    </section>
  )
}
