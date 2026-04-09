import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Budget from './pages/Budget'
import Dashboard from './pages/Dashboard'
import { resetDemoState } from './demo/demoApi'
import { getDemoMode, setDemoMode } from './demo/mode'
import Goals from './pages/Goals'
import Subscriptions from './pages/Subscriptions'
import './App.css'

type NavItem = {
  to: string
  label: string
  icon: 'dashboard' | 'budget' | 'goals' | 'subscriptions'
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/budget', label: 'Budget', icon: 'budget' },
  { to: '/goals', label: 'Goals', icon: 'goals' },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'subscriptions' },
]

function NavIcon({ icon }: { icon: NavItem['icon'] }) {
  if (icon === 'budget') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
        <path d="M3.5 10.5h17" />
        <path d="M8 14.5h2" />
      </svg>
    )
  }

  if (icon === 'goals') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 4.5v3" />
      </svg>
    )
  }

  if (icon === 'subscriptions') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 8.5h14" />
        <path d="M5 12h14" />
        <path d="M5 15.5h9" />
        <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
    </svg>
  )
}

function AppShell() {
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const [demoModeEnabled, setDemoModeEnabled] = useState(() => getDemoMode())
  const current = navItems.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  )

  const dispatchDashboardEvent = (name: 'app:view-reports' | 'app:add-transaction') => {
    const dispatch = () => window.dispatchEvent(new CustomEvent(name))
    if (location.pathname !== '/') {
      navigate('/')
      setTimeout(dispatch, 60)
      return
    }
    dispatch()
  }

  useEffect(() => {
    const onDemoModeChanged = (event: Event) => {
      const custom = event as CustomEvent<boolean>
      setDemoModeEnabled(Boolean(custom.detail))
    }
    window.addEventListener('demo-mode-changed', onDemoModeChanged)
    return () => window.removeEventListener('demo-mode-changed', onDemoModeChanged)
  }, [])

  const enableDemoMode = () => {
    if (!getDemoMode()) {
      resetDemoState()
    }
    setDemoMode(true)
    setDemoModeEnabled(true)
    queryClient.clear()
  }

  const toggleDemoMode = () => {
    const next = !getDemoMode()
    if (next) {
      resetDemoState()
    }
    setDemoMode(next)
    setDemoModeEnabled(next)
    queryClient.clear()
  }

  return (
    <div className="app">
      <aside className="icon-rail" aria-label="Primary Navigation">
        <div className="rail-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="rail-link"
              title={item.label}
              aria-label={item.label}
            >
              <NavIcon icon={item.icon} />
            </NavLink>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="breadcrumbs" aria-label="Breadcrumb">
            <span>Home</span>
            <span>/</span>
            <strong>{current?.label ?? 'Dashboard'}</strong>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className={`header-button toggle ${demoModeEnabled ? 'active' : ''}`}
              onClick={toggleDemoMode}
            >
              {demoModeEnabled ? 'Demo: On' : 'Demo Mode'}
            </button>
            <button
              type="button"
              className="header-button secondary"
              onClick={() => dispatchDashboardEvent('app:view-reports')}
            >
              View Reports
            </button>
            <button
              type="button"
              className="header-button primary"
              onClick={() => dispatchDashboardEvent('app:add-transaction')}
            >
              Add Transaction
            </button>
          </div>
        </header>

        <main className="workspace-main">
          <Routes>
            <Route path="/" element={<Dashboard demoModeEnabled={demoModeEnabled} onEnableDemoMode={enableDemoMode} />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
          </Routes>
        </main>
      </section>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

export default App
