import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getLedger, getMonthlyPnl } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import DashboardActionQueue from '../components/DashboardActionQueue'
import DashboardCommandHeader from '../components/DashboardCommandHeader'
import DashboardKpis from '../components/DashboardKpis'
import ExperiencePreview from '../components/ExperiencePreview'
import FileUploader from '../components/FileUploader'
import MonthlyHealthSummary from '../components/MonthlyHealthSummary'
import PnlTable from '../components/PnlTable'
import TransactionList from '../components/TransactionList'

interface DashboardProps {
  canEnableDemo: boolean
  demoModeEnabled: boolean
  onEnableDemoMode: () => void
}

function Dashboard({ canEnableDemo, demoModeEnabled, onEnableDemoMode }: DashboardProps) {
  const [, setActivePnlYear] = useState<number | null>(null)
  const [uploadVisible, setUploadVisible] = useState(false)
  const [activeReport, setActiveReport] = useState<'pnl' | 'transactions'>('pnl')

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
    const onViewReports = () => {
      document
        .getElementById('reports-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    const onUploadStatements = () => {
      setUploadVisible(true)
    }
    window.addEventListener('app:view-reports', onViewReports)
    window.addEventListener('app:upload-statements', onUploadStatements)
    return () => {
      window.removeEventListener('app:view-reports', onViewReports)
      window.removeEventListener('app:upload-statements', onUploadStatements)
    }
  }, [])

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
            <MonthlyHealthSummary />
            <DashboardKpis />
            <DashboardActionQueue />

            {uploadVisible && (
              <div className="dashboard-upload-flow">
                <FileUploader />
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
                    onClick={() => setActiveReport('pnl')}
                  >
                    P&amp;L
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeReport === 'transactions'}
                    className={activeReport === 'transactions' ? 'active' : ''}
                    onClick={() => setActiveReport('transactions')}
                  >
                    Transactions
                  </button>
                </div>
              </div>
              <div className="dashboard-reports-main">
                {activeReport === 'pnl' ? (
                  <PnlTable onActiveYearChange={setActivePnlYear} />
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
