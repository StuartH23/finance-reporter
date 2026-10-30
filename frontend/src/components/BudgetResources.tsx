const tipLinks = [
  {
    title: 'Budget Worksheet (consumer.gov)',
    description: 'Simple worksheet to map income vs. expenses each month.',
    href: 'https://consumer.gov/your-money/budget-worksheet',
  },
  {
    title: '50/30/20 Budget Calculator (NerdWallet)',
    description: 'Quick way to set a target split for needs, wants, and savings/debt.',
    href: 'https://www.nerdwallet.com/article/finance/nerdwallet-budget-calculator',
  },
  {
    title: 'YNAB Method',
    description: 'Give every dollar a job and rebalance categories as priorities change.',
    href: 'https://www.ynab.com/ynab-method',
  },
  {
    title: 'Envelope Budgeting (Goodbudget)',
    description: 'Classic envelope system adapted for digital budgeting.',
    href: 'https://goodbudget.com/envelope-budgeting/',
  },
]

function BudgetResources() {
  return (
    <div className="card">
      <h2>Budgeting Tips and Ideas</h2>

      <div className="resource-grid">
        {tipLinks.map((item) => (
          <a
            key={item.href}
            className="resource-link"
            href={item.href}
            target="_blank"
            rel="noreferrer"
          >
            <div className="resource-title">{item.title}</div>
            <div className="resource-description">{item.description}</div>
          </a>
        ))}
      </div>
    </div>
  )
}

export default BudgetResources
