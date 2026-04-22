import { useEffect, useRef } from 'react'

type AuthRequiredScreenProps = {
  error?: string | null
  onSignIn: () => void
  onGuestDemo: () => void
}

function AuthRequiredScreen({ error, onSignIn, onGuestDemo }: AuthRequiredScreenProps) {
  const fired = useRef(false)

  useEffect(() => {
    if (!error && !fired.current) {
      fired.current = true
      onSignIn()
    }
  }, [error, onSignIn])

  return (
    <main className="auth-entry-shell">
      <section className="auth-entry" aria-labelledby="auth-entry-title">
        <div className="auth-entry-copy">
          <p className="auth-brand">Finance Reporter</p>
          {error ? (
            <>
              <h1 id="auth-entry-title">Unable to sign in</h1>
              <p className="form-error auth-entry-error" role="alert">
                {error}
              </p>
              <div className="auth-entry-actions">
                <button type="button" className="primary-button" onClick={onSignIn}>
                  Try Again
                </button>
                <button type="button" className="auth-secondary-button" onClick={onGuestDemo}>
                  Continue as Guest Demo
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 id="auth-entry-title">Redirecting to sign in...</h1>
              <p className="auth-lede">
                You'll be redirected to sign in momentarily.
              </p>
              <div className="auth-entry-actions">
                <button type="button" className="auth-secondary-button" onClick={onGuestDemo}>
                  Continue as Guest Demo
                </button>
              </div>
            </>
          )}
          <p className="auth-demo-note">Guest demo uses sample transactions only.</p>
        </div>
        <div className="auth-entry-preview" aria-label="Finance snapshot">
          <img src="/screenshots/preview-dashboard.svg" alt="Finance dashboard preview" />
          <div className="auth-preview-metrics" aria-label="Sample finance snapshot">
            <div>
              <span>Monthly Net</span>
              <strong>$2,450</strong>
            </div>
            <div>
              <span>Goal Room</span>
              <strong>$680</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default AuthRequiredScreen
