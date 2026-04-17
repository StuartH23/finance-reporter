import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { uploadFiles } from '../api/client'
import type { UploadResponse } from '../api/types'
import { useGuestFeature } from '../guest/GuestFeatureProvider'
import PrivacyNotice from './PrivacyNotice'

function FileUploader() {
  const queryClient = useQueryClient()
  const { isGuestDemo, showGuestFeature } = useGuestFeature()
  const [isExpanded, setIsExpanded] = useState(false)
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
      setIsExpanded(false)
    },
    onError: () => {
      setIsExpanded(true)
    },
  })

  const queuePrivacyPrompt = useCallback(() => {
    setShowPrivacyModal(true)
  }, [])

  const showUploadLocked = useCallback(() => {
    showGuestFeature({
      title: 'Sign in to unlock uploads',
      message:
        'Guest Demo uses sample transactions only. Sign in with email or Google to upload statements and save your own finance data.',
    })
  }, [showGuestFeature])

  const beginBrowseFlow = useCallback(() => {
    if (uploadMutation.isPending) return
    setIsExpanded(true)
    if (isGuestDemo) {
      showUploadLocked()
      return
    }
    if (!privacyAccepted) {
      setPendingBrowse(true)
      queuePrivacyPrompt()
      return
    }
    requestAnimationFrame(() => inputRef.current?.click())
  }, [isGuestDemo, privacyAccepted, queuePrivacyPrompt, showUploadLocked, uploadMutation.isPending])

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    setIsExpanded(true)
    if (isGuestDemo) {
      showUploadLocked()
      return
    }
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
      setIsExpanded(true)
      requestAnimationFrame(() => inputRef.current?.click())
    }
  }

  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  useEffect(() => {
    const onUploadStatements = () => {
      document
        .getElementById('upload-statements')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      beginBrowseFlow()
    }
    window.addEventListener('app:upload-statements', onUploadStatements)
    return () => window.removeEventListener('app:upload-statements', onUploadStatements)
  }, [beginBrowseFlow])

  const results: UploadResponse | undefined = uploadMutation.data
  const errorMessage = uploadMutation.error?.message
  const successfulFiles = results?.files.filter((file) => file.status === 'ok').length ?? 0
  const failedFiles = results?.files.filter((file) => file.status === 'error').length ?? 0
  const uploadStatus = isGuestDemo
    ? 'Guest demo uses sample transactions only. Sign in to upload your own statements.'
    : results
      ? `${results.total_transactions} transactions ready from ${successfulFiles} ${
          successfulFiles === 1 ? 'file' : 'files'
        }${failedFiles > 0 ? `; ${failedFiles} failed` : ''}.`
      : 'Upload CSV or PDF statements when you want to use your own data.'

  return (
    <div
      className={`card upload-card ${isExpanded ? 'expanded' : 'collapsed'}`}
      id="upload-statements"
    >
      <div className="upload-option-header">
        <div>
          <h2>Statement Upload</h2>
          <p className="privacy-inline-note">{uploadStatus}</p>
        </div>
        <div className="upload-option-actions">
          <button
            type="button"
            className="primary-button"
            disabled={uploadMutation.isPending}
            onClick={beginBrowseFlow}
          >
            {isGuestDemo
              ? 'Uploads Locked'
              : uploadMutation.isPending
                ? 'Processing...'
                : 'Upload Statements'}
          </button>
          <button
            type="button"
            className="ghost-button"
            aria-expanded={isExpanded}
            aria-controls="upload-options"
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            {isExpanded ? 'Hide Details' : results ? 'Review Files' : 'Upload Options'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div id="upload-options" className="upload-options">
          <p className="privacy-inline-note">
            {isGuestDemo
              ? 'Uploads are disabled in guest demo mode. No personal files are read or sent.'
              : 'We will prompt for Privacy Notice acceptance before first upload in this session.'}
          </p>
          {isGuestDemo ? (
            <div className="guest-demo-lock">
              Sample data is already loaded. Sign in with email or Google to upload real files and
              save changes.
            </div>
          ) : (
            <>
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
              <button
                type="button"
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
              >
                {uploadMutation.isPending ? (
                  <p>Processing files...</p>
                ) : (
                  <p>Drop CSV or PDF files here, or click to browse</p>
                )}
              </button>
              <div className="upload-inline-actions">
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
            </>
          )}

          {results && (
            <div className="upload-results" aria-live="polite">
              <div className="upload-results-list">
                {results.files.map((f) => (
                  <div key={f.file} className={`upload-result ${f.status}`}>
                    <span>{f.file}</span>
                    <span>{f.status === 'ok' ? `${f.transactions} transactions` : 'Failed'}</span>
                  </div>
                ))}
              </div>
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
        </div>
      )}

      {showPrivacyModal && (
        <div className="privacy-modal-backdrop">
          <div
            className="privacy-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Privacy Notice"
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
        .upload-card {
          scroll-margin-top: 0.9rem;
        }
        .upload-option-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }
        .upload-option-header h2 {
          margin-bottom: 0.34rem;
        }
        .upload-option-actions,
        .upload-inline-actions {
          display: flex;
          align-items: center;
          gap: 0.44rem;
          flex-wrap: wrap;
        }
        .upload-options {
          margin-top: 0.72rem;
        }
        .upload-inline-actions {
          margin-top: 0.55rem;
        }
        .guest-demo-lock {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface-muted);
          color: var(--text-muted);
          padding: 0.78rem 0.85rem;
          font-size: 0.84rem;
        }
        .drop-zone {
          width: 100%;
          border: 2px dashed var(--border);
          border-radius: 8px;
          background: transparent;
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
        .upload-results-list {
          max-height: 8.75rem;
          overflow-y: auto;
          padding-right: 0.2rem;
        }
        .privacy-inline-note {
          color: var(--text-muted);
          font-size: 0.82rem;
          margin-bottom: 0;
        }
        .upload-options > .privacy-inline-note {
          margin-bottom: 0.6rem;
        }
        .upload-result {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.4rem 0;
          border-bottom: 1px solid var(--border);
        }
        .upload-result span:first-child {
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .upload-result span:last-child {
          flex: 0 0 auto;
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
        @media (max-width: 720px) {
          .upload-option-header {
            align-items: stretch;
            flex-direction: column;
          }
          .upload-option-actions {
            justify-content: flex-start;
          }
          .upload-option-actions .primary-button,
          .upload-option-actions .ghost-button {
            flex: 1 1 150px;
          }
        }
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
