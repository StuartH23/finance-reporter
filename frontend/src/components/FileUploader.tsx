import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { uploadFiles } from '../api/client'
import type { UploadResponse } from '../api/types'
import { useGuestFeature } from '../guest/GuestFeatureProvider'
import PrivacyNotice from './PrivacyNotice'

interface FileUploaderProps {
  openRequest?: number
}

function FileUploader({ openRequest = 0 }: FileUploaderProps) {
  const queryClient = useQueryClient()
  const { isGuestDemo, showGuestFeature } = useGuestFeature()
  const [isExpanded, setIsExpanded] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)

  useEffect(() => {
    if (!isGuestDemo) {
      try {
        if (localStorage.getItem('finance-reporter.privacy-accepted') === '1') {
          setPrivacyAccepted(true)
        }
      } catch {
        // ignore storage errors
      }
    }
  }, [isGuestDemo])
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
  const [pendingBrowse, setPendingBrowse] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const handledOpenRequestRef = useRef(0)

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
    if (!isGuestDemo) {
      try {
        localStorage.setItem('finance-reporter.privacy-accepted', '1')
      } catch {
        // ignore storage errors
      }
    }

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
    if (openRequest <= handledOpenRequestRef.current) return
    handledOpenRequestRef.current = openRequest
    document
      .getElementById('upload-statements')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    beginBrowseFlow()
  }, [beginBrowseFlow, openRequest])

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
          {isGuestDemo ? (
            <span className="upload-locked-note">Sign in to upload your own statements</span>
          ) : (
            <>
              <button
                type="button"
                className="primary-button"
                disabled={uploadMutation.isPending}
                onClick={beginBrowseFlow}
              >
                {uploadMutation.isPending ? 'Processing...' : 'Upload Statements'}
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
            </>
          )}
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
                className="u-hidden-input"
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
    </div>
  )
}

export default FileUploader
