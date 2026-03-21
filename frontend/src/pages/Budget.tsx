import { useState } from 'react'
import BudgetEditor from '../components/BudgetEditor'
import BudgetResources from '../components/BudgetResources'

function Budget() {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null)

  return (
    <div>
      <h1 className="page-title">Budget</h1>
      <p className="page-subtitle">
        Build monthly targets from real spending history and track progress for your selected month
        in one place.
      </p>
      <BudgetEditor
        selectedMonthKey={selectedMonthKey}
        onSelectedMonthKeyChange={setSelectedMonthKey}
      />
      <BudgetResources />
    </div>
  )
}

export default Budget
