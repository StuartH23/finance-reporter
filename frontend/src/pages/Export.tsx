import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, useMemo, useRef, useState } from 'react'
import {
  BACKUP_DATASET_LABELS,
  type BackupDocument,
  type BackupPreview,
  type FullExportFormat,
  isFullExportFormat,
  parseBackupText,
} from '../api/backup'
import {
  exportFullBackup,
  exportLedgerTransactions,
  getLedger,
  previewBackup,
  restoreBackup,
} from '../api/client'
import { queryKeys } from '../api/queryKeys'
import PageHeader from '../components/primitives/PageHeader'
import { useGuestFeature } from '../guest/GuestFeatureProvider'

type TransactionExportFormat = 'csv' | 'xlsx'
type BusyState = 'full' | 'transactions' | 'preview' | 'restore' | null

function isTransactionExportFormat(value: string): value is TransactionExportFormat {
  return value === 'csv' || value === 'xlsx'
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function BackupPreviewPanel({
  preview,
  pending,
  onConfirm,
}: {
  preview: BackupPreview
  pending: boolean
  onConfirm: () => void
}) {
  return (
    <div className="export-preview">
      <h3>Backup preview</h3>
      <p className="export-note">
        Exported {preview.exported_at}. Nothing is changed until you confirm.
      </p>
      <ul className="export-counts">
        {BACKUP_DATASET_LABELS.map((dataset) => (
          <li key={dataset.key}>
            <strong>{preview.counts[dataset.key].toLocaleString()}</strong>
            <span>{dataset.label}</span>
          </li>
        ))}
      </ul>
      {preview.warnings.length > 0 && (
        <ul className="export-warning-list">
          {preview.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <button type="button" className="primary-button" onClick={onConfirm} disabled={pending}>
        {pending ? 'Restoring…' : 'Restore this backup'}
      </button>
    </div>
  )
}

function ExportPage() {
  const queryClient = useQueryClient()
  const guest = useGuestFeature()
  const ledgerQuery = useQuery({
    queryKey: queryKeys.ledger,
    queryFn: getLedger,
  })
  const [fullFormat, setFullFormat] = useState<FullExportFormat>('zip')
  const [transactionFormat, setTransactionFormat] = useState<TransactionExportFormat>('csv')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [busy, setBusy] = useState<BusyState>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [backupText, setBackupText] = useState<string | null>(null)
  const [backupFileName, setBackupFileName] = useState<string | null>(null)
  const [parsedBackup, setParsedBackup] = useState<BackupDocument | null>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const readRequest = useRef(0)

  const categories = useMemo(() => {
    const names = new Set<string>(['Uncategorized'])
    for (const transaction of ledgerQuery.data?.transactions ?? []) {
      if (transaction.category) names.add(transaction.category)
    }
    return [...names].sort((left, right) => left.localeCompare(right))
  }, [ledgerQuery.data])

  const dateRangeInvalid = Boolean(startDate && endDate && startDate > endDate)

  async function downloadFullExport() {
    setBusy('full')
    setError(null)
    setSuccess(null)
    try {
      const result = await exportFullBackup(fullFormat)
      saveBlob(result.blob, result.filename)
      setSuccess(`Downloaded ${result.filename}.`)
    } catch (downloadError) {
      setError(messageFrom(downloadError, 'Could not download the export.'))
    } finally {
      setBusy(null)
    }
  }

  async function downloadTransactions() {
    if (dateRangeInvalid) return
    setBusy('transactions')
    setError(null)
    setSuccess(null)
    try {
      const result = await exportLedgerTransactions({
        allDates: true,
        format: transactionFormat,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      })
      saveBlob(result.blob, result.filename)
      setSuccess(`Downloaded ${result.filename}.`)
    } catch (downloadError) {
      setError(messageFrom(downloadError, 'Could not download the transactions.'))
    } finally {
      setBusy(null)
    }
  }

  function onBackupFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const requestId = readRequest.current + 1
    readRequest.current = requestId
    setPreview(null)
    setParsedBackup(null)
    setError(null)
    setSuccess(null)
    setBackupFileName(file?.name ?? null)
    setBackupText(null)
    if (!file) return
    void file.text().then(
      (text) => {
        if (readRequest.current === requestId) setBackupText(text)
      },
      () => {
        if (readRequest.current === requestId) setError('Could not read that file.')
      },
    )
  }

  async function previewSelectedBackup() {
    if (!backupText) {
      setError('Choose a JSON backup first.')
      return
    }
    setBusy('preview')
    setError(null)
    setSuccess(null)
    setPreview(null)
    try {
      const parsed = parseBackupText(backupText)
      const summary = await previewBackup(parsed)
      setParsedBackup(parsed)
      setPreview(summary)
    } catch (previewError) {
      setParsedBackup(null)
      setError(messageFrom(previewError, 'Could not preview that backup.'))
    } finally {
      setBusy(null)
    }
  }

  async function confirmRestore() {
    if (!parsedBackup) return
    setBusy('restore')
    setError(null)
    setSuccess(null)
    try {
      const result = await restoreBackup(parsedBackup)
      await queryClient.invalidateQueries()
      const transactionCount = result.counts.transactions.toLocaleString()
      setSuccess(`Restored ${transactionCount} transactions and the rest of this backup.`)
      setPreview(null)
      setParsedBackup(null)
      setBackupText(null)
      setBackupFileName(null)
    } catch (restoreError) {
      setError(messageFrom(restoreError, 'Could not restore that backup.'))
    } finally {
      setBusy(null)
    }
  }

  function toggleCategory(category: string, checked: boolean) {
    setSelectedCategories((current) => {
      if (checked) return current.includes(category) ? current : [...current, category]
      return current.filter((item) => item !== category)
    })
  }

  return (
    <div className="export-page">
      <PageHeader
        title="Export"
        subtitle="Download everything this app has saved, or a filtered transaction file. File names include today's date."
      />

      {guest.isGuestDemo && (
        <p className="export-warning">
          Guest demo keeps sample goals and plans in this browser. Export and restore use the data
          saved on the server. Turn off demo mode before downloading or restoring your own records.
        </p>
      )}

      {error && (
        <p className="export-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="export-success" role="status">
          {success}
        </p>
      )}

      <section className="card export-section">
        <h2>Full backup</h2>
        <p className="export-note">
          Includes transactions with categories, monthly budgets, category keyword rules,
          subscriptions and the essential or ignored flags, goals, the saved paycheck plan, and
          action feedback. Ask AI chat stays in this browser and is not included.
        </p>
        <fieldset className="export-choices">
          <legend>Format</legend>
          <label className="export-choice">
            <input
              type="radio"
              name="full-export-format"
              value="zip"
              checked={fullFormat === 'zip'}
              onChange={(event) => {
                if (isFullExportFormat(event.target.value)) setFullFormat(event.target.value)
              }}
            />
            <span>
              <strong>CSV zip</strong>
              <small>One CSV per data type, plus backup.json</small>
            </span>
          </label>
          <label className="export-choice">
            <input
              type="radio"
              name="full-export-format"
              value="xlsx"
              checked={fullFormat === 'xlsx'}
              onChange={(event) => {
                if (isFullExportFormat(event.target.value)) setFullFormat(event.target.value)
              }}
            />
            <span>
              <strong>Excel workbook</strong>
              <small>One sheet per data type</small>
            </span>
          </label>
          <label className="export-choice">
            <input
              type="radio"
              name="full-export-format"
              value="json"
              checked={fullFormat === 'json'}
              onChange={(event) => {
                if (isFullExportFormat(event.target.value)) setFullFormat(event.target.value)
              }}
            />
            <span>
              <strong>JSON backup</strong>
              <small>Lossless file you can restore later</small>
            </span>
          </label>
        </fieldset>
        <div className="export-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => void downloadFullExport()}
            disabled={busy !== null}
          >
            {busy === 'full' ? 'Preparing…' : 'Download full export'}
          </button>
        </div>
      </section>

      <section className="card export-section">
        <h2>Transactions only</h2>
        <p className="export-note">
          Leave the dates empty to include every transaction. Leave every category unchecked to
          include all categories. Amounts are plain numbers and dates are YYYY-MM-DD.
        </p>
        <div className="export-dates">
          <label className="field-label">
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className="field-label">
            End date
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>
        {dateRangeInvalid && (
          <p className="export-error" role="alert">
            Start date must be on or before the end date.
          </p>
        )}
        <fieldset className="export-categories">
          <legend>Categories</legend>
          <div className="export-category-list">
            {categories.map((category) => (
              <label key={category} className="export-category">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category)}
                  onChange={(event) => toggleCategory(category, event.target.checked)}
                />
                <span>{category}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="export-choices">
          <legend>Transaction format</legend>
          <label className="export-choice">
            <input
              type="radio"
              name="transaction-export-format"
              value="csv"
              checked={transactionFormat === 'csv'}
              onChange={(event) => {
                if (isTransactionExportFormat(event.target.value)) {
                  setTransactionFormat(event.target.value)
                }
              }}
            />
            <span>
              <strong>CSV</strong>
            </span>
          </label>
          <label className="export-choice">
            <input
              type="radio"
              name="transaction-export-format"
              value="xlsx"
              checked={transactionFormat === 'xlsx'}
              onChange={(event) => {
                if (isTransactionExportFormat(event.target.value)) {
                  setTransactionFormat(event.target.value)
                }
              }}
            />
            <span>
              <strong>Excel</strong>
            </span>
          </label>
        </fieldset>
        <div className="export-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => void downloadTransactions()}
            disabled={busy !== null || dateRangeInvalid}
          >
            {busy === 'transactions' ? 'Preparing…' : 'Download transactions'}
          </button>
        </div>
      </section>

      <section className="card export-section">
        <h2>Restore a JSON backup</h2>
        <p className="export-note">
          Preview the file first. Restore replaces the transactions, budgets, category rules, goals,
          paycheck plan, subscription flags, and action feedback currently saved in this app.
        </p>
        <div className="export-actions">
          <label className="field-label">
            JSON backup
            <input type="file" accept=".json,application/json" onChange={onBackupFileChange} />
          </label>
          <button
            type="button"
            className="ghost-button"
            onClick={() => void previewSelectedBackup()}
            disabled={busy !== null || !backupText}
          >
            {busy === 'preview' ? 'Checking…' : 'Preview backup'}
          </button>
        </div>
        {backupFileName && <p className="export-note">Selected {backupFileName}</p>}
        {preview && (
          <BackupPreviewPanel
            preview={preview}
            pending={busy === 'restore'}
            onConfirm={() => void confirmRestore()}
          />
        )}
      </section>
    </div>
  )
}

export default ExportPage
