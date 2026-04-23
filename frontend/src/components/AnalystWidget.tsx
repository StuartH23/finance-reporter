import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { AnalystRateLimitError, postAnalystChat } from '../api/client'
import type { AnalystMessage } from '../api/types'

const STORAGE_KEY = 'analyst-history'

function loadStoredMessages(): AnalystMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AnalystMessage[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
    )
  } catch {
    return []
  }
}

export default function AnalystWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AnalystMessage[]>(() => loadStoredMessages())
  const [input, setInput] = useState('')
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {
      // Ignore persistence errors.
    }
  }, [messages])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new message or panel open
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, open])

  useEffect(() => {
    if (rateLimitUntil == null) return
    const msLeft = rateLimitUntil - Date.now()
    if (msLeft <= 0) {
      setRateLimitUntil(null)
      return
    }
    const timer = window.setTimeout(() => setRateLimitUntil(null), msLeft)
    return () => window.clearTimeout(timer)
  }, [rateLimitUntil])

  const mutation = useMutation({
    mutationFn: postAnalystChat,
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: data.content }])
      setErrorMsg(null)
    },
    onError: (err, variables) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        const sentLast = variables.messages[variables.messages.length - 1]
        if (last && sentLast && last.role === 'user' && last.content === sentLast.content) {
          return prev.slice(0, -1)
        }
        return prev
      })
      if (err instanceof AnalystRateLimitError) {
        setRateLimitUntil(Date.now() + err.retryAfterSeconds * 1000)
        setErrorMsg(null)
      } else {
        setErrorMsg(err instanceof Error ? err.message : String(err))
      }
    },
  })

  const rateLimited = rateLimitUntil != null && rateLimitUntil > Date.now()

  const submit = () => {
    const trimmed = input.trim()
    if (!trimmed || mutation.isPending || rateLimited) return
    const nextMessages: AnalystMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setErrorMsg(null)
    mutation.mutate({ messages: nextMessages })
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const clearHistory = () => {
    setMessages([])
    setErrorMsg(null)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="analyst-fab"
        onClick={() => setOpen(true)}
        aria-label="Open Financial Analyst chat"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
          <path d="M4 5h16v11H7l-3 3z" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span>Ask Analyst</span>
      </button>
    )
  }

  const retrySeconds = rateLimitUntil
    ? Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1000))
    : 0

  return (
    <div className="analyst-panel" role="dialog" aria-label="Financial Analyst">
      <header className="analyst-panel-header">
        <span className="analyst-panel-title">Financial Analyst</span>
        <div className="analyst-panel-actions">
          <button
            type="button"
            className="analyst-panel-icon"
            onClick={clearHistory}
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          </button>
          <button
            type="button"
            className="analyst-panel-icon"
            onClick={() => setOpen(false)}
            aria-label="Close analyst chat"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
      </header>

      <div className="analyst-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="analyst-message assistant">
            Ask me about your spending, trends, subscriptions, or budget. Upload a statement on the
            Dashboard first if you haven't.
          </div>
        )}
        {messages.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: chat messages have no stable id
          <div key={`${i}-${m.role}`} className={`analyst-message ${m.role}`}>
            {m.content}
          </div>
        ))}
        {mutation.isPending && <div className="analyst-message assistant pending">Thinking…</div>}
      </div>

      {rateLimited && (
        <div className="analyst-banner rate-limit">
          Rate limit reached — try again in ~{retrySeconds}s.
        </div>
      )}
      {errorMsg && !rateLimited && <div className="analyst-banner error">Error: {errorMsg}</div>}

      <div className="analyst-input-row">
        <textarea
          className="analyst-input"
          placeholder={rateLimited ? 'Rate limited — please wait.' : 'Ask a question…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          disabled={mutation.isPending || rateLimited}
        />
        <button
          type="button"
          className="analyst-send"
          onClick={submit}
          disabled={!input.trim() || mutation.isPending || rateLimited}
        >
          Send
        </button>
      </div>
    </div>
  )
}
