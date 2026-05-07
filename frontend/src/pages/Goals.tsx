import GoalBudgetPlanner from '../components/GoalBudgetPlanner'
import PageHeader from '../components/primitives/PageHeader'

function Goals() {
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Goal-Driven Budgeting"
        subtitle="Build goals, auto-plan each paycheck, and review transparent allocation explanations."
      />
      <GoalBudgetPlanner />
    </div>
  )
}

export default Goals
