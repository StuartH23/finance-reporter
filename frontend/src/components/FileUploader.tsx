import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { uploadFiles } from '../api/client'
import type { UploadResponse } from '../api/types'
import PrivacyNotice from './PrivacyNotice'

function FileUploader() {
  const queryClient = useQueryClient()
  const [dragOver, setDragOver] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
  const [pendingBrowse, setPendingBrowse] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useMutation({
    mutationFn: (files: FileList | File[]) => uploadFiles(files),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })

  const queuePrivacyPrompt = () => {
    setShowPrivacyModal(true)
  }

  const beginBrowseFlow = () => {
    if (!privacyAccepted) {
      setPendingBrowse(true)
      queuePrivacyPrompt()
      return
    }
    inputRef.current?.click()
  }

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    const selected = Array.from(files)
    if (!privacyAccepted) {
      setPendingFiles(selected)
      setPendingBrowse(false)
      queuePrivacyPrompt()
      return
    }
    uploadMutation.mutate(selected)
  }

  const closePrivacyModal = () => {
    setShowPrivacyModal(false)
    setPendingFiles(null)
    setPendingBrowse(false)
  }

  const acceptPrivacyAndContinue = () => {
    setPrivacyAccepted(true)
    setShowPrivacyModal(false)

    if (pendingFiles && pendingFiles.length > 0) {
      uploadMutation.mutate(pendingFiles)
      setPendingFiles(null)
      setPendingBrowse(false)
      return
    }

    if (pendingBrowse) {
      setPendingBrowse(false)
      requestAnimationFrame(() => inputRef.current?.click())
    }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  useEffect(() => {
    const onAddTransaction = () => {
      document.getElementById('upload-statements')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      beginBrowseFlow()
    }
    window.addEventListener('app:add-transaction', onAddTransaction)
    return () => window.removeEventListener('app:add-transaction', onAddTransaction)
  }, [privacyAccepted])

  const results: UploadResponse | undefined = uploadMutation.data
  const errorMessage = uploadMutation.error?.message

  return (
    <div className="card" id="upload-statements">
      <h2>Upload Statements</h2>
      <p className="privacy-inline-note">
        We will prompt for Privacy Notice acceptance before first upload in this session.
      </p>
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
        onClick={() => {
          beginBrowseFlow()
        }}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            beginBrowseFlow()
          }
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
      <div style={{ marginTop: '0.55rem' }}>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            setPendingBrowse(false)
            setPendingFiles(null)
            queuePrivacyPrompt()
          }}
        >
          Review Privacy Notice
        </button>
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

      {errorMessage && <p className="error-text">{errorMessage}</p>}
      {showPrivacyModal && (
        <div className="privacy-modal-backdrop" role="presentation" onClick={closePrivacyModal}>
          <div
            className="privacy-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Privacy Notice"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="privacy-modal-close"
              aria-label="Close privacy notice"
              onClick={closePrivacyModal}
            >
              X
            </button>
            <PrivacyNotice className="privacy-modal-content" />
            <div className="privacy-modal-actions">
              <button type="button" className="danger-button" onClick={closePrivacyModal}>
                Decline
              </button>
              <button type="button" className="primary-button" onClick={acceptPrivacyAndContinue}>
                Accept and Continue
              </button>
            </div>
          </div>
        </div>
      )}

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
          color: var(--green);
          font-size: 0.78rem;
        }
        .error-text { color: var(--red); margin-top: 0.5rem; }
        .privacy-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 35, 63, 0.55);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          z-index: 1200;
        }
        .privacy-modal {
          position: relative;
          width: min(920px, 95vw);
          max-height: 92vh;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
          box-shadow: var(--shadow-soft);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .privacy-modal-content {
          padding: 1rem 1.1rem 0.85rem;
          background: var(--surface);
          overflow-y: auto;
        }
        .privacy-modal-close {
          position: absolute;
          top: 0.5rem;
          right: 0.6rem;
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface-muted);
          color: var(--text-muted);
          font-size: 1.1rem;
          line-height: 1;
        }
        .privacy-modal-close:hover {
          background: #eaf2fb;
          color: var(--text);
        }
        .privacy-modal-content h2 {
          margin-bottom: 0.75rem;
          color: var(--text);
          font-size: 0.84rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .privacy-modal-content .privacy-notice-updated {
          color: var(--text-muted);
          font-size: 0.82rem;
          margin-bottom: 0.55rem;
        }
        .privacy-modal-content .privacy-notice-intro {
          color: var(--text);
          margin-bottom: 0.85rem;
          font-size: 0.86rem;
        }
        .privacy-modal-content .privacy-consent {
          margin: 0 0 0.9rem;
          color: var(--text-muted);
          font-size: 0.84rem;
        }
        .privacy-modal-content .privacy-notice-section + .privacy-notice-section {
          margin-top: 0.85rem;
        }
        .privacy-modal-content .privacy-notice-section h3 {
          color: var(--text);
          margin-bottom: 0.28rem;
          font-size: 0.88rem;
        }
        .privacy-modal-content .privacy-notice-section p {
          color: var(--text-muted);
          line-height: 1.48;
          font-size: 0.86rem;
          max-width: 84ch;
        }
        .privacy-modal-actions {
          display: flex;
          justify-content: center;
          gap: 0.6rem;
          padding: 0.85rem 1rem 1rem;
          border-top: 1px solid var(--border);
          background: var(--surface-muted);
        }
        .danger-button {
          border: 1px solid var(--red);
          background: var(--red);
          color: #ffffff;
          border-radius: 6px;
          padding: 0.52rem 0.72rem;
          font-size: 0.8rem;
        }
        .danger-button:hover {
          background: #a03137;
          border-color: #a03137;
        }
      `}</style>
    </div>
  )
}

export default FileUploader
