import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getLedger, getMonthlyPnl } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import DashboardActionQueue from '../components/DashboardActionQueue'
import DashboardCommandHeader from '../components/DashboardCommandHeader'
import DashboardKpis from '../components/DashboardKpis'
import ExperiencePreview from '../components/ExperiencePreview'
import MonthlyHealthSummary from '../components/MonthlyHealthSummary'
import PnlTable from '../components/PnlTable'
import TransactionList from '../components/TransactionList'
import { type DashboardReport, normalizeDashboardReport } from './dashboardReportState'

const FileUploader = lazy(() => import('../components/FileUploader'))

interface DashboardProps {
  canEnableDemo: boolean
  demoModeEnabled: boolean
  onEnableDemoMode: () => void
}

function UploadFallback() {
  return (
    <div className="card upload-card upload-card-loading" role="status" aria-live="polite">
      <p>Loading upload tools...</p>
    </div>
  )
}

function Dashboard({ canEnableDemo, demoModeEnabled, onEnableDemoMode }: DashboardProps) {
  const [, setActivePnlYear] = useState<number | null>(null)
  const [uploadVisible, setUploadVisible] = useState(false)
  const [uploadOpenRequest, setUploadOpenRequest] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeReport, setActiveReport] = useState<DashboardReport>(() =>
    normalizeDashboardReport(searchParams.get('report')),
  )

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: queryKeys.ledger,
    queryFn: getLedger,
  })

  const { data: monthlyData } = useQuery({
    queryKey: queryKeys.pnl.monthly,
    queryFn: getMonthlyPnl,
  })

  const hasTransactions = (ledgerData?.count ?? 0) > 0

  useEffect(() => {
    const normalized = normalizeDashboardReport(searchParams.get('report'))
    setActiveReport(normalized)
    if (searchParams.get('report') !== normalized) {
      const next = new URLSearchParams(searchParams)
      next.set('report', normalized)
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const onViewReports = () => {
      document
        .getElementById('reports-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    const onUploadStatements = () => {
      setUploadVisible(true)
      setUploadOpenRequest((request) => request + 1)
    }
    window.addEventListener('app:view-reports', onViewReports)
    window.addEventListener('app:upload-statements', onUploadStatements)
    return () => {
      window.removeEventListener('app:view-reports', onViewReports)
      window.removeEventListener('app:upload-statements', onUploadStatements)
    }
  }, [])

  const selectReport = (report: DashboardReport) => {
    const next = new URLSearchParams(searchParams)
    next.set('report', report)
    setSearchParams(next)
  }

  const showFirstSession = canEnableDemo && !demoModeEnabled && !ledgerLoading && !hasTransactions

  return (
    <div className="dashboard-page dashboard-page-enterprise">
      {showFirstSession ? (
        <ExperiencePreview onEnableDemo={onEnableDemoMode} />
      ) : (
        <>
          <DashboardCommandHeader
            demoModeEnabled={demoModeEnabled}
            ledgerData={ledgerData}
            monthlyData={monthlyData}
          />

          <main className="dashboard-monthly-layout">
            <MonthlyHealthSummary monthlyData={monthlyData} />
            <DashboardKpis monthlyData={monthlyData} />
            <DashboardActionQueue />

            {uploadVisible && (
              <div className="dashboard-upload-flow">
                <Suspense fallback={<UploadFallback />}>
                  <FileUploader openRequest={uploadOpenRequest} />
                </Suspense>
              </div>
            )}

            <section
              id="reports-section"
              className="dashboard-reports"
              aria-labelledby="reports-title"
            >
              <div className="dashboard-reports-header">
                <div>
                  <div className="dashboard-section-kicker">Reports</div>
                  <h2 id="reports-title">Details</h2>
                </div>
                <div
                  className="dashboard-report-tabs"
                  role="tablist"
                  aria-label="Dashboard reports"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeReport === 'pnl'}
                    className={activeReport === 'pnl' ? 'active' : ''}
                    onClick={() => selectReport('pnl')}
                  >
                    P&amp;L
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeReport === 'transactions'}
                    className={activeReport === 'transactions' ? 'active' : ''}
                    onClick={() => selectReport('transactions')}
                  >
                    Transactions
                  </button>
                </div>
              </div>
              <div className="dashboard-reports-main">
                {activeReport === 'pnl' ? (
                  <PnlTable monthlyData={monthlyData} onActiveYearChange={setActivePnlYear} />
                ) : (
                  <TransactionList />
                )}
              </div>
            </section>
          </main>
        </>
      )}
    </div>
  )
}

export default Dashboard
