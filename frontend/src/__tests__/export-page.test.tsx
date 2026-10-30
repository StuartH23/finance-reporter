import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  type BackupPreview,
  backupCountsSchema,
  parseBackupDocument,
  parseBackupText,
} from '../api/backup'
import { queryKeys } from '../api/queryKeys'
import { transactionIdSchema } from '../api/schemas'
import type { LedgerResponse } from '../api/types'
import ExportPage, { BackupPreviewPanel } from '../pages/Export'

const counts = backupCountsSchema.parse({
  transactions: 2,
  budgets: 1,
  category_rules: 1,
  subscriptions: 1,
  subscription_charges: 3,
  goals: 1,
  goal_contributions: 1,
  paycheck_plan: 1,
  paycheck_allocations: 1,
  action_feedback: 0,
  action_history: 0,
  action_type_bias: 0,
  action_metric_weights: 0,
  action_catalog: 0,
})

const preview: BackupPreview = {
  version: 1,
  exported_at: '2026-10-30T00:00:00Z',
  counts,
  warnings: ['Restore replaces the monthly budgets and category keyword rules saved for this app.'],
}

function emptyBackup() {
  return {
    version: 1,
    exported_at: '2026-10-30T00:00:00Z',
    transactions: [],
    budgets: [],
    category_rules: [],
    subscriptions: [],
    subscription_charges: [],
    goals: [],
    goal_contributions: [],
    paycheck_plan: [],
    paycheck_allocations: [],
    action_feedback: [],
    action_history: [],
    action_type_bias: [],
    action_metric_weights: [],
    action_catalog: [],
  }
}

describe('backup documents', () => {
  it('accepts an empty version 1 backup and rejects malformed files', () => {
    expect(parseBackupText(JSON.stringify(emptyBackup())).version).toBe(1)
    expect(() => parseBackupText('{')).toThrow('That file is not valid JSON.')
    expect(() => parseBackupText('{"version":1}')).toThrow(
      'That file is not a finance backup this app can read.',
    )
  })

  it('keeps transaction amounts as numbers', () => {
    const document = parseBackupDocument({
      ...emptyBackup(),
      transactions: [
        {
          id: 'tx-1',
          date: '2026-03-02',
          description: 'Corner Cafe',
          amount: -4.5,
          category: 'Dining Out',
          source_file: 'synthetic.csv',
          category_edited: true,
        },
      ],
    })
    expect(document.transactions[0]?.amount).toBe(-4.5)
    expect(() =>
      parseBackupDocument({
        ...emptyBackup(),
        transactions: [
          {
            id: 'tx-1',
            date: '2026-03-02',
            description: 'Corner Cafe',
            amount: '-$4.50',
            category: 'Dining Out',
            source_file: 'synthetic.csv',
            category_edited: true,
          },
        ],
      }),
    ).toThrow('That file is not a finance backup this app can read.')
  })
})

describe('export page', () => {
  it('lets the user choose a full export format and transaction filters', () => {
    const queryClient = new QueryClient()
    const ledger: LedgerResponse = {
      transactions: [
        {
          id: transactionIdSchema.parse('tx-1'),
          date: '2026-03-02',
          description: 'Corner Cafe',
          amount: -4.5,
          category: 'Dining Out',
          source_file: 'synthetic.csv',
        },
      ],
      count: 1,
    }
    queryClient.setQueryData(queryKeys.ledger, ledger)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ExportPage />
      </QueryClientProvider>,
    )

    expect(html).toContain('Full backup')
    expect(html).toContain('CSV zip')
    expect(html).toContain('Excel workbook')
    expect(html).toContain('JSON backup')
    expect(html).toContain('Download full export')
    expect(html).toContain('Start date')
    expect(html).toContain('End date')
    expect(html).toContain('Dining Out')
    expect(html).toContain('Uncategorized')
    expect(html).toContain('Download transactions')
    expect(html).toContain('Preview backup')
    expect(html).not.toContain('Restore this backup')
  })

  it('shows restore only after a preview', () => {
    const html = renderToStaticMarkup(
      <BackupPreviewPanel preview={preview} pending={false} onConfirm={() => undefined} />,
    )

    expect(html).toContain('Backup preview')
    expect(html).toContain('2')
    expect(html).toContain('Transactions')
    expect(html).toContain('Restore this backup')
    expect(html).toContain('Nothing is changed until you confirm.')
    expect(html).toContain('monthly budgets')
  })
})
