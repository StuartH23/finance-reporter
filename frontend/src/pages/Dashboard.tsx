import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getLedger, getMonthlyPnl } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import DashboardActionQueue from '../components/DashboardActionQueue'
import DashboardAttentionRail from '../components/DashboardAttentionRail'
import DashboardCommandHeader from '../components/DashboardCommandHeader'
import DashboardKpis from '../components/DashboardKpis'
import ExperiencePreview from '../components/ExperiencePreview'
import FileUploader from '../components/FileUploader'
import InsightsPanel from '../components/InsightsPanel'
import PnlTable from '../components/PnlTable'
import TransactionList from '../components/TransactionList'

interface DashboardProps {
  canEnableDemo: boolean
  demoModeEnabled: boolean
  onEnableDemoMode: () => void
}

function Dashboard({ canEnableDemo, demoModeEnabled, onEnableDemoMode }: DashboardProps) {
  const [, setActivePnlYear] = useState<number | null>(null)

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
    window.addEventListener('app:view-reports', onViewReports)
    return () => window.removeEventListener('app:view-reports', onViewReports)
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

          <div className="dashboard-console-grid">
            <div className="dashboard-console-main">
              <div className="dashboard-question-label">What Changed</div>
              <DashboardKpis />
              <DashboardActionQueue />

              <div id="reports-section" className="dashboard-reports">
                <div className="dashboard-reports-main">
                  <PnlTable onActiveYearChange={setActivePnlYear} />
                  <TransactionList />
                </div>
              </div>
            </div>

            <aside className="dashboard-console-rail" aria-label="Dashboard attention rail">
              <DashboardAttentionRail />
              <div className="dashboard-upload-panel">
                <FileUploader />
              </div>
              <InsightsPanel />
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

export default Dashboard
