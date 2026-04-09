interface PrivacyNoticeProps {
  accepted?: boolean
  onAcceptedChange?: (accepted: boolean) => void
  showAcceptanceControl?: boolean
  className?: string
}

function PrivacyNotice({
  accepted = false,
  onAcceptedChange,
  showAcceptanceControl = false,
  className = 'card',
}: PrivacyNoticeProps) {
  return (
    <div className={className}>
      <h2>Privacy Notice</h2>
      <p className="privacy-notice-updated">Last updated: March 21, 2026</p>
      <p className="privacy-notice-intro">
        This tool is for budgeting help and organization, not financial, legal, or tax advice.
      </p>
      {showAcceptanceControl && (
        <label className="privacy-consent">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => onAcceptedChange?.(e.target.checked)}
          />
          <span>I have read and accept this Privacy Notice for statement uploads.</span>
        </label>
      )}

      <div className="privacy-notice-section">
        <h3>1. File uploads (/api/upload)</h3>
        <p>
          You can upload CSV or PDF bank statement files. The app reads uploaded file bytes directly
          into memory for parsing. The app code does not persist the original uploaded PDF file to
          local disk.
        </p>
      </div>

      <div className="privacy-notice-section">
        <h3>2. Session data in memory</h3>
        <p>
          Parsed transaction data is stored in server memory and associated to your session via a
          session cookie. This data is used for ledger, budget, and report views during your active
          session and is replaced when you upload new files in the same session.
        </p>
      </div>

      <div className="privacy-notice-section">
        <h3>3. Data written to disk by this app</h3>
        <p>
          Budget settings are saved to <code>backend/data/budget.csv</code>. Feature interest
          signups are saved to <code>backend/data/feature_interest.csv</code> and include email,
          optional name, selected features, optional notes, and timestamp.
        </p>
      </div>

      <div className="privacy-notice-section">
        <h3>4. Cookies</h3>
        <p>
          The app sets a <code>session_id</code> cookie (HttpOnly, SameSite=Lax) to associate
          in-memory session data with your browser session.
        </p>
      </div>

      <div className="privacy-notice-section">
        <h3>5. Scope note</h3>
        <p>
          This notice describes app-level behavior in this codebase. External deployment
          infrastructure such as reverse proxies, hosting logs, monitoring tools, and backups may have
          separate retention and logging behavior.
        </p>
      </div>
      <style>{`
        .privacy-consent {
          display: flex;
          gap: 0.55rem;
          align-items: flex-start;
          color: var(--text-muted);
          font-size: 0.82rem;
          margin: 0.4rem 0 0.8rem;
        }
        .privacy-consent input {
          margin-top: 0.14rem;
        }
      `}</style>
    </div>
  )
}

export default PrivacyNotice
