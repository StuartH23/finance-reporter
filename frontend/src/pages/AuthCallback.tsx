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
    <section className="card auth-callback-card">
      <h2>Sign In</h2>
      <p>{message}</p>
      {auth.error && <p className="form-error">{auth.error}</p>}
      {failed && (
        <button type="button" className="primary-button" onClick={() => void auth.signIn('/')}>
          Try Sign In Again
        </button>
      )}
    </section>
  )
}

export default AuthCallback
