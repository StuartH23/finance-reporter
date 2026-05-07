type SkeletonProps = Readonly<{
  variant?: 'line' | 'block' | 'circle'
  lines?: number
  className?: string
  ariaLabel?: string
}>

function Skeleton({
  variant = 'line',
  lines = 1,
  className,
  ariaLabel = 'Loading',
}: SkeletonProps) {
  const classes = ['skeleton', `skeleton--${variant}`, className ?? ''].filter(Boolean).join(' ')

  if (lines <= 1) {
    return <span className={classes} role="status" aria-label={ariaLabel} />
  }

  const lineKeys = Array.from({ length: lines }, (_, index) => `skeleton-line-${index + 1}`)

  return (
    <span className="skeleton-stack" role="status" aria-label={ariaLabel}>
      {lineKeys.map((lineKey) => (
        <span className={classes} key={lineKey} />
      ))}
    </span>
  )
}

export default Skeleton
