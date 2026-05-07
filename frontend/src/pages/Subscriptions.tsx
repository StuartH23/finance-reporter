import PageHeader from '../components/primitives/PageHeader'
import SubscriptionCenter from '../components/SubscriptionCenter'

function Subscriptions() {
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Subscriptions"
        subtitle="Detect recurring charges, review price changes, and manage optional vs essential services."
      />
      <SubscriptionCenter />
    </div>
  )
}

export default Subscriptions
