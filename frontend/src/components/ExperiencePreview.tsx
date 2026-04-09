interface ExperiencePreviewProps {
  onEnableDemo: () => void
}

const previewShots = [
  {
    title: 'Dashboard Overview',
    caption: 'KPI cards, monthly reports, and action feed in one screen.',
    src: '/screenshots/preview-dashboard.svg',
  },
  {
    title: 'Budget Planning',
    caption: 'Set category limits and compare against recommended spending.',
    src: '/screenshots/preview-budget.svg',
  },
  {
    title: 'Subscription Center',
    caption: 'Track recurring charges, detect increases, and act fast.',
    src: '/screenshots/preview-subscriptions.svg',
  },
]

function ExperiencePreview({ onEnableDemo }: ExperiencePreviewProps) {
  return (
    <section className="card experience-preview">
      <div className="experience-header">
        <div>
          <h2>Preview The Experience</h2>
          <p className="budget-hint">
            See how Finance Reporter looks with populated data, then decide whether to upload your own files.
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
