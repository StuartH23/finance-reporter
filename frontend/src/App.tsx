import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Budget from './pages/Budget'
import CashFlow from './pages/CashFlow'
import Dashboard from './pages/Dashboard'
import { resetDemoState } from './demo/demoApi'
import { getDemoMode, setDemoMode } from './demo/mode'
import Goals from './pages/Goals'
import Subscriptions from './pages/Subscriptions'
import './App.css'

type NavItem = {
  to: string
  label: string
  icon: 'dashboard' | 'cashflow' | 'budget' | 'goals' | 'subscriptions'
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/cash-flow', label: 'Cash Flow', icon: 'cashflow' },
  { to: '/budget', label: 'Budget', icon: 'budget' },
  { to: '/goals', label: 'Goals', icon: 'goals' },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'subscriptions' },
]

const SIDEBAR_PREF_KEY = 'pnl-reporter.sidebar-collapsed'

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

  if (icon === 'cashflow') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h5v12H4z" />
        <path d="M10 4h5v15h-5z" />
        <path d="M16 10h4v9h-4z" />
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(SIDEBAR_PREF_KEY) === '1'
    } catch {
      return false
    }
  })
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

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_PREF_KEY, sidebarCollapsed ? '1' : '0')
    } catch {
      // Ignore persistence errors.
    }
  }, [sidebarCollapsed])

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
    <div className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside
        className={`icon-rail ${sidebarCollapsed ? 'collapsed' : ''}`}
        aria-label="Primary Navigation"
      >
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5 4 12l5 7" />
            <path d="M15 5l5 7-5 7" />
          </svg>
          <span className="rail-label">{sidebarCollapsed ? 'Expand' : 'Collapse'}</span>
        </button>
        <div className="rail-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="rail-link"
              title={sidebarCollapsed ? item.label : undefined}
              aria-label={item.label}
            >
              <NavIcon icon={item.icon} />
              <span className="rail-label">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <span>Home</span>
            <span>/</span>
            <strong>{current?.label ?? 'Dashboard'}</strong>
          </nav>
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
            <Route
              path="/"
              element={
                <Dashboard demoModeEnabled={demoModeEnabled} onEnableDemoMode={enableDemoMode} />
              }
            />
            <Route path="/cash-flow" element={<CashFlow />} />
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
