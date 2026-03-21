import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type DragEvent, type KeyboardEvent, useRef, useState } from 'react'
import { uploadFiles } from '../api/client'
import type { UploadResponse } from '../api/types'

function FileUploader() {
  const queryClient = useQueryClient()
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useMutation({
    mutationFn: (files: FileList | File[]) => uploadFiles(files),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
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
        </div>
      )}

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
        .error-text { color: var(--red); margin-top: 0.5rem; }
      `}</style>
    </div>
  )
}

export default FileUploader
