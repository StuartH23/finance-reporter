import FileUploader from '../components/FileUploader'
import PrivacyNotice from '../components/PrivacyNotice'
import PnlTable from '../components/PnlTable'
import SpendingPieChart from '../components/SpendingPieChart'
import TransactionList from '../components/TransactionList'

function Dashboard() {
  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <FileUploader />
      <PrivacyNotice />
      <PnlTable />
      <SpendingPieChart />
      <TransactionList />
    </div>
  )
}

export default Dashboard
