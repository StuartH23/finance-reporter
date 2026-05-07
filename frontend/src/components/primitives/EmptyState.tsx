import type { ReactNode } from 'react'

type EmptyStateProps = Readonly<{
  icon?: ReactNode
  title?: ReactNode
  body: ReactNode
  action?: ReactNode
  compact?: boolean
  className?: string
}>

function EmptyState({ icon, title, body, action, compact = false, className }: EmptyStateProps) {
  const classes = ['empty-state', compact ? 'empty-state-compact' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {icon && <div className="empty-state-icon">{icon}</div>}
      {title && <h3 className="empty-state-title">{title}</h3>}
      <p className="empty-state-body">{body}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}

export default EmptyState
