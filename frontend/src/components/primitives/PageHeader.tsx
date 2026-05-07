import type { ReactNode } from 'react'

type PageHeaderProps = Readonly<{
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}>

function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  )
}

export default PageHeader
