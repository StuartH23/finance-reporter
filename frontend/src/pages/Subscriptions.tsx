import SubscriptionCenter from '../components/SubscriptionCenter'

function Subscriptions() {
  return (
    <div>
      <h1 className="page-title">Subscriptions</h1>
      <p className="page-subtitle">
        Detect recurring charges, review price changes, and manage optional vs essential services.
      </p>
      <SubscriptionCenter />
    </div>
  )
}

export default Subscriptions
