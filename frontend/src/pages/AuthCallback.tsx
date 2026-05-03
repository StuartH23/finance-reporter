import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

function AuthCallback() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [message, setMessage] = useState('Completing sign in...')
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    setMessage(attempt > 0 ? 'Retrying sign in...' : 'Completing sign in...')

    auth
      .completeSignIn()
      .then((returnPath) => {
        if (cancelled) return
        navigate(returnPath || '/', { replace: true })
      })
      .catch((err) => {
        if (cancelled) return
        setFailed(true)
        setMessage(err instanceof Error ? err.message : 'Sign-in failed.')
      })

    return () => {
      cancelled = true
    }
  }, [attempt, auth.completeSignIn, navigate])

  return (
    <main className="auth-status-shell">
      <section className="auth-status-panel" aria-live="polite">
        <h1>Sign In</h1>
        <p>{message}</p>
        {auth.error && <p className="form-error">{auth.error}</p>}
        {failed && (
          <div className="control-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => navigate('/', { replace: true })}
            >
              Back to Dashboard
            </button>
            <button type="button" className="ghost-button" onClick={() => void auth.signIn('/')}>
              Start Over
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

export default AuthCallback
