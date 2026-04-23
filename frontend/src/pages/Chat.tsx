import { useRef, useState } from 'react'
import { sendChat, type ChatMessage } from '../api/client'

const SUGGESTIONS = [
  'Where am I spending the most money?',
  'What are my current subscriptions?',
  'What changed in my spending last month?',
  'Any unusual charges recently?',
]

function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setError(null)
    const next: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const response = await sendChat(next)
      setMessages([...next, { role: 'assistant', content: response.reply }])
      requestAnimationFrame(() => {
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight })
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="page-title">Ask your finances</h1>
      <p className="page-subtitle">
        Ask questions about your spending, subscriptions, and app features. Powered by Claude Haiku.
      </p>

      <div
        ref={scrollerRef}
        style={{
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 12,
          padding: 16,
          minHeight: 320,
          maxHeight: 500,
          overflowY: 'auto',
          background: 'var(--surface, #fafafa)',
          marginBottom: 12,
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: 'var(--muted, #6b7280)' }}>
            <p style={{ marginTop: 0 }}>Try one of these:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  disabled={loading}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: '1px solid var(--border, #d1d5db)',
                    background: 'white',
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              margin: '8px 0',
              textAlign: m.role === 'user' ? 'right' : 'left',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                padding: '8px 12px',
                borderRadius: 12,
                background: m.role === 'user' ? '#dbeafe' : 'white',
                border: '1px solid var(--border, #e5e7eb)',
                maxWidth: '80%',
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content}
            </span>
          </div>
        ))}
        {loading && (
          <div style={{ color: 'var(--muted, #6b7280)', fontStyle: 'italic' }}>Thinking…</div>
        )}
      </div>

      {error && (
        <div style={{ color: '#b91c1c', marginBottom: 8 }} role="alert">
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your spending…"
          disabled={loading}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid var(--border, #d1d5db)',
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="header-button primary"
        >
          Send
        </button>
      </form>
    </div>
  )
}

export default Chat
