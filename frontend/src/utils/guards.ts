import type { LedgerTransactionOptions } from '../api/client'
import type { CashFlowGranularity, CashFlowGroupBy } from '../api/types'

export function isCashFlowGranularity(value: string): value is CashFlowGranularity {
  return value === 'year' || value === 'month' || value === 'quarter'
}

export function isCashFlowGroupBy(value: string): value is CashFlowGroupBy {
  return value === 'category' || value === 'merchant'
}

export function isLedgerType(
  value: string,
): value is NonNullable<LedgerTransactionOptions['type']> {
  return value === 'income' || value === 'spending' || value === 'transfer'
}

export function isLedgerSort(
  value: string,
): value is NonNullable<LedgerTransactionOptions['sort']> {
  return (
    value === 'date' ||
    value === 'description' ||
    value === 'amount' ||
    value === 'category' ||
    value === 'source_file'
  )
}

export function isSortDirection(
  value: string,
): value is NonNullable<LedgerTransactionOptions['direction']> {
  return value === 'asc' || value === 'desc'
}

export function isPaycheckMode(value: string): value is 'balanced' | 'aggressive_savings' {
  return value === 'balanced' || value === 'aggressive_savings'
}
