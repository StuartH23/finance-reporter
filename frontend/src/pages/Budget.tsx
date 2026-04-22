import { useState } from 'react'
import BudgetEditor from '../components/BudgetEditor'
import BudgetResources from '../components/BudgetResources'
import GoalBudgetPlanner from '../components/GoalBudgetPlanner'

type BudgetTab = 'category' | 'goal'

function Budget() {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<BudgetTab>('category')

  return (
    <div>
      <h1 className="page-title">Budget</h1>
      <p className="page-subtitle">
        Build monthly targets from real spending history, or set up goal-driven paycheck planning —
        pick the approach that fits your style.
      </p>

      <div className="budget-tab-bar">
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
