interface ExperiencePreviewProps {
  onEnableDemo: () => void
}

const previewShots = [
  {
    title: 'What Changed',
    caption: 'Compare income, spending, and savings so the month has a clear status.',
    src: '/screenshots/preview-dashboard.svg',
  },
  {
    title: 'Where Money Leaks',
    caption: 'Spot budget pressure and unusual categories before they become habits.',
    src: '/screenshots/preview-budget.svg',
  },
  {
    title: 'What To Do Next',
    caption: 'Review recurring charges, price increases, and the highest-impact next action.',
    src: '/screenshots/preview-subscriptions.svg',
  },
]

function ExperiencePreview({ onEnableDemo }: ExperiencePreviewProps) {
  return (
    <section className="card experience-preview">
      <div className="experience-header">
        <div>
          <h2>Preview Maya's Money Checkup</h2>
          <p className="budget-hint">
            Use sample data to see how the app explains what changed, what deserves attention, and
            what action to take next.
          </p>
        </div>
        <button type="button" className="primary-button" onClick={onEnableDemo}>
          Try Demo Mode
        </button>
      </div>

      <div className="preview-grid">
        {previewShots.map((shot) => (
          <article key={shot.title} className="preview-shot">
            <img src={shot.src} alt={`${shot.title} screenshot preview`} loading="lazy" />
            <h3>{shot.title}</h3>
            <p>{shot.caption}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export default ExperiencePreview
