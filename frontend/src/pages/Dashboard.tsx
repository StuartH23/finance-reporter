import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getLedger } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import DashboardKpis from '../components/DashboardKpis'
import ExperiencePreview from '../components/ExperiencePreview'
import FileUploader from '../components/FileUploader'
import InsightsPanel from '../components/InsightsPanel'
import NextBestActionFeed from '../components/NextBestActionFeed'
import PnlTable from '../components/PnlTable'
import SpendingPieChart from '../components/SpendingPieChart'
import TransactionList from '../components/TransactionList'

interface DashboardProps {
  demoModeEnabled: boolean
  onEnableDemoMode: () => void
}

function Dashboard({ demoModeEnabled, onEnableDemoMode }: DashboardProps) {
  const [activePnlYear, setActivePnlYear] = useState<number | null>(null)

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: queryKeys.ledger,
    queryFn: getLedger,
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

  return (
    <div className="dashboard-page">
      <h1 className="page-title">Dashboard</h1>
      {!demoModeEnabled && !ledgerLoading && !hasTransactions && (
        <ExperiencePreview onEnableDemo={onEnableDemoMode} />
      )}
      <DashboardKpis />
      <div className="dashboard-layout">
        <div className="dashboard-main-column">
          <FileUploader />
          <div id="reports-section">
            <PnlTable onActiveYearChange={setActivePnlYear} />
          </div>
          <TransactionList />
        </div>
        <aside className="dashboard-side-column">
          <NextBestActionFeed />
          <InsightsPanel />
          <SpendingPieChart showBreakdownTable={false} year={activePnlYear} />
        </aside>
      </div>
    </div>
  )
}

export default Dashboard
