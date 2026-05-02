import GoalBudgetPlanner from '../components/GoalBudgetPlanner'

function Goals() {
  return (
    <div className="dashboard-page">
      <h1 className="page-title">Goal-Driven Budgeting</h1>
      <p className="page-subtitle">
        Build goals, auto-plan each paycheck, and review transparent allocation explanations.
      </p>
      <GoalBudgetPlanner />
    </div>
  )
}

export default Goals
