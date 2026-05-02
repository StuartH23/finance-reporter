import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { AnalystRateLimitError, postAnalystChat } from '../api/client'
import type { AnalystMessage } from '../api/types'
import { getDemoLedgerCsv } from '../demo/demoApi'
import { getDemoMode } from '../demo/mode'

const STORAGE_KEY = 'analyst-history'

const SUGGESTIONS = [
  'Did I spend more on food this month?',
  'Which subscriptions should I review?',
  'What changed since last month?',
  'Can I afford a $200 purchase this week?',
]

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

function Chat() {
  const [messages, setMessages] = useState<AnalystMessage[]>(() => loadStoredMessages())
  const [input, setInput] = useState('')
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const isDemo = getDemoMode()

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {
      // ignore
    }
  }, [messages])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new message
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
  }, [messages])

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

  const submit = (text?: string) => {
    const trimmed = (text ?? input).trim()
    if (!trimmed || mutation.isPending || rateLimited) return
    const nextMessages: AnalystMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setErrorMsg(null)
    mutation.mutate({
      messages: nextMessages,
      ...(isDemo && { demo_ledger_csv: getDemoLedgerCsv() }),
    })
  }

  const clearHistory = () => {
    setMessages([])
    setErrorMsg(null)
  }

  const retrySeconds = rateLimitUntil
    ? Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1000))
    : 0

  return (
    <div className="dashboard-page">
      <div className="chat-page-header">
        <div>
          <h1 className="page-title">Ask AI</h1>
          <p className="page-subtitle">
            Ask questions about your spending, subscriptions, or budget.
            {isDemo && ' Using demo account data.'}
          </p>
        </div>
        {messages.length > 0 && (
          <button type="button" className="ghost-button" onClick={clearHistory}>
            Clear
          </button>
        )}
      </div>

      <div className="chat-messages" ref={scrollerRef}>
        {messages.length === 0 && (
          <>
            <div className="chat-message assistant">
              {isDemo
                ? "I have access to the demo account's transactions. Ask me about spending, budget, subscriptions, or anything else."
                : "Ask me about your spending, trends, subscriptions, or budget. Upload a statement on the Dashboard first if you haven't."}
            </div>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ghost-button"
                  onClick={() => submit(s)}
                  disabled={mutation.isPending}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: chat messages have no stable id
          <div key={`${i}-${m.role}`} className={`chat-message ${m.role}`}>
            {m.role === 'assistant' ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content}
          </div>
        ))}

        {mutation.isPending && <div className="chat-message assistant pending">Thinking…</div>}
      </div>

      {rateLimited && (
        <div className="chat-banner rate-limit">
          Rate limit reached — try again in ~{retrySeconds}s.
        </div>
      )}
      {errorMsg && !rateLimited && <div className="chat-banner error">Error: {errorMsg}</div>}

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          placeholder={rateLimited ? 'Rate limited — please wait.' : 'Ask a question…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={2}
          disabled={mutation.isPending || rateLimited}
        />
        <button
          type="button"
          className="primary-button"
          onClick={() => submit()}
          disabled={!input.trim() || mutation.isPending || rateLimited}
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default Chat
