import ExperiencePreview from './ExperiencePreview'

type AuthRequiredScreenProps = Readonly<{
  error?: string | null
  onSignIn: () => void
  onGuestDemo: () => void
}>

function AuthRequiredScreen({ error, onSignIn, onGuestDemo }: AuthRequiredScreenProps) {
  return (
    <main className="auth-entry-shell">
      <section className="auth-entry" aria-labelledby="auth-entry-title">
        <div className="auth-entry-copy">
          <p className="auth-brand">Finance Reporter</p>
          <h1 id="auth-entry-title">Sign in to continue</h1>
          <p className="auth-lede">
            Upload statements, draft budgets, and track goals across sessions.
          </p>
          {error && (
            <p className="form-error auth-entry-error" role="alert">
              {error}
            </p>
          )}
          <div className="auth-entry-actions">
            <button type="button" className="primary-button" onClick={onSignIn}>
              Sign In
            </button>
            <button type="button" className="auth-secondary-button" onClick={onGuestDemo}>
              Continue as Guest Demo
            </button>
          </div>
          <p className="auth-demo-note">Guest demo uses sample data — no signup, no data saved.</p>
        </div>
        <ExperiencePreview onEnableDemo={onGuestDemo} />
      </section>
    </main>
  )
}

export default AuthRequiredScreen
