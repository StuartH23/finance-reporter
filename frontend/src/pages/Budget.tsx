import { useState } from 'react'
import BudgetEditor from '../components/BudgetEditor'
import BudgetResources from '../components/BudgetResources'
import GoalBudgetPlanner from '../components/GoalBudgetPlanner'
import PageHeader from '../components/primitives/PageHeader'

type BudgetTab = 'category' | 'goal'

function Budget() {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<BudgetTab>('category')

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Budget"
        subtitle="Build monthly targets from real spending history, or set up goal-driven paycheck planning — pick the approach that fits your style."
      />

      <div className="budget-tab-bar segmented-control">
        <button
          type="button"
          className={`budget-tab ${activeTab === 'category' ? 'active' : ''}`}
          onClick={() => setActiveTab('category')}
        >
          Category Budget
        </button>
        <button
          type="button"
          className={`budget-tab ${activeTab === 'goal' ? 'active' : ''}`}
          onClick={() => setActiveTab('goal')}
        >
          Goal-Driven
        </button>
      </div>

      {activeTab === 'category' && (
        <BudgetEditor
          selectedMonthKey={selectedMonthKey}
          onSelectedMonthKeyChange={setSelectedMonthKey}
        />
      )}

      {activeTab === 'goal' && <GoalBudgetPlanner />}

      <BudgetResources />
    </div>
  )
}

export default Budget
