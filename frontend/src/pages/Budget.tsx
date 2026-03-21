import BudgetEditor from '../components/BudgetEditor'
import BudgetQuickCheck from '../components/BudgetQuickCheck'

function Budget() {
  return (
    <div>
      <h1 className="page-title">Budget</h1>
      <BudgetQuickCheck />
      <BudgetEditor />
    </div>
  )
}

export default Budget
