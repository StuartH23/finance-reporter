// Upload
export interface FileResult {
  file: string
  status: 'ok' | 'error'
  transactions: number
}

export interface UploadResponse {
  files: FileResult[]
  total_transactions: number
  pnl_transactions: number
  transfer_transactions: number
}

// Ledger
export interface Transaction {
  date: string
  description: string
  amount: number
  category: string
  source_file: string
}

export interface LedgerResponse {
  transactions: Transaction[]
  count: number
}

// Transfers
export interface TransferSummaryItem {
  category: string
  total: number
  transactions: number
}

export interface TransferResponse {
  transactions: Transaction[]
  count: number
  summary: TransferSummaryItem[]
}

// P&L
export interface MonthlyPnl {
  month_str: string
  income: number
  expenses: number
  net: number
  profitable: boolean
}

export interface MonthlyPnlResponse {
  months: MonthlyPnl[]
}

export interface YearlyPnl {
  year: number
  income: number
  expenses: number
  net: number
  profitable: boolean
}

export interface YearlyPnlResponse {
  years: YearlyPnl[]
}

// Category breakdown
export interface CategorySummary {
  category: string
  income: number
  expenses: number
  net: number
  transactions: number
}

export interface SpendingChartItem {
  category: string
  total: number
  transactions: number
  percentage?: number
}

export interface CategoryBreakdownResponse {
  categories: CategorySummary[]
  spending_chart: SpendingChartItem[]
}

// Budget
export interface BudgetItem {
  category: string
  monthly_budget: number
}

export interface BudgetListResponse {
  budget: BudgetItem[]
}

export interface BudgetUpdateResponse {
  status: string
  categories: number
}

export interface BudgetComparison {
  category: string
  monthly_budget: number
  avg_actual: number
  total_actual: number
  diff: number
  pct_used: number
}

export interface BudgetSummary {
  monthly_budget: number
  avg_monthly_spending: number
  surplus_deficit: number
  months_of_data: number
}

export interface BudgetVsActualResponse {
  comparison: BudgetComparison[]
  summary: BudgetSummary | Record<string, never>
}

// Quick Check
export interface QuickCheckCategory {
  category: string
  spent: number
  budgeted: number
  remaining: number | null
  pct_used: number | null
  over_budget: boolean | null
}

export interface QuickCheckResponse {
  month: string | null
  status?: string
  total_budget?: number
  total_spent?: number
  total_remaining?: number
  pct_used?: number
  categories?: QuickCheckCategory[]
}

// Categories
export interface CategoryRule {
  category: string
  keywords: string
}

export interface CategoriesResponse {
  categories: CategoryRule[]
}

// Health
export interface HealthResponse {
  status: string
}
