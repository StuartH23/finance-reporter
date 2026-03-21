import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type DragEvent, type KeyboardEvent, useRef, useState } from 'react'
import { uploadFiles } from '../api/client'
import type { UploadResponse } from '../api/types'

function FileUploader() {
  const queryClient = useQueryClient()
  const [dragOver, setDragOver] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)
  const [consentError, setConsentError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useMutation({
    mutationFn: (files: FileList | File[]) => uploadFiles(files),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    if (!consentChecked) {
      setConsentError(
        'Please confirm the privacy notice before uploading files.'
      )
      return
    }
    setConsentError('')
    uploadMutation.mutate(Array.from(files))
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const results: UploadResponse | undefined = uploadMutation.data
  const errorMessage = uploadMutation.error?.message

  return (
    <div className="card">
      <h2>Upload Statements</h2>
      <p className="privacy-inline-note">
        We process uploaded CSV/PDF files in memory to generate your report. We do not write the
        original uploaded PDF file to disk.
      </p>
      <label className="privacy-consent">
        <input
          type="checkbox"
          checked={consentChecked}
          onChange={(e) => {
            setConsentChecked(e.target.checked)
            if (e.target.checked) {
              setConsentError('')
            }
          }}
        />
        <span>
          I understand this tool processes files for budgeting help, does not store original uploaded
          PDF files, and may keep derived transaction data in memory during my active session.
        </span>
      </label>
      <div
        role="button"
        tabIndex={0}
        className={`drop-zone ${dragOver ? 'active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {uploadMutation.isPending ? (
          <p>Processing files...</p>
        ) : (
          <p>Drop CSV or PDF files here, or click to browse</p>
        )}
      </div>

      {results && (
        <div className="upload-results">
          {results.files.map((f) => (
            <div key={f.file} className={`upload-result ${f.status}`}>
              <span>{f.file}</span>
              <span>{f.status === 'ok' ? `${f.transactions} transactions` : 'Failed'}</span>
            </div>
          ))}
          <div className="upload-summary">
            {results.total_transactions} total &middot; {results.pnl_transactions} P&L &middot;{' '}
            {results.transfer_transactions} transfers
          </div>
          <div className="upload-privacy-confirmation">
            Report generated. Original uploaded PDF files are not stored by this app.
          </div>
        </div>
      )}

      {consentError && <p className="error-text">{consentError}</p>}
      {errorMessage && <p className="error-text">{errorMessage}</p>}

      <style>{`
        .drop-zone {
          border: 2px dashed var(--border);
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          cursor: pointer;
          color: var(--text-muted);
          transition: all 0.15s;
        }
        .drop-zone:hover, .drop-zone.active {
          border-color: var(--accent);
          color: var(--text);
        }
        .upload-results {
          margin-top: 1rem;
          font-size: 0.875rem;
        }
        .privacy-inline-note {
          color: var(--text-muted);
          font-size: 0.82rem;
          margin-bottom: 0.6rem;
        }
        .privacy-consent {
          display: flex;
          gap: 0.55rem;
          align-items: flex-start;
          color: var(--text-muted);
          font-size: 0.78rem;
          margin-bottom: 0.8rem;
        }
        .privacy-consent input {
          margin-top: 0.14rem;
        }
        .upload-result {
          display: flex;
          justify-content: space-between;
          padding: 0.4rem 0;
          border-bottom: 1px solid var(--border);
        }
        .upload-result.ok span:last-child { color: var(--green); }
        .upload-result.error span:last-child { color: var(--red); }
        .upload-summary {
          margin-top: 0.5rem;
          color: var(--text-muted);
          font-size: 0.8rem;
        }
        .upload-privacy-confirmation {
          margin-top: 0.5rem;
          color: #86efac;
          font-size: 0.78rem;
        }
        .error-text { color: var(--red); margin-top: 0.5rem; }
      `}</style>
    </div>
  )
}

export default FileUploader
