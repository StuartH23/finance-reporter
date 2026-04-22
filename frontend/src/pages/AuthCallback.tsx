import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

function AuthCallback() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [message, setMessage] = useState('Completing sign in...')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

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
  }, [auth.completeSignIn, navigate])

  return (
    <main className="auth-status-shell">
      <section className="auth-status-panel" aria-live="polite">
        <h1>Sign In</h1>
        <p>{message}</p>
        {auth.error && <p className="form-error">{auth.error}</p>}
        {failed && (
          <button type="button" className="primary-button" onClick={() => void auth.signIn('/')}>
            Try Sign In Again
          </button>
        )}
      </section>
    </main>
  )
}

export default AuthCallback
