import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { resetDemoState } from './demo/demoApi'
import { getDemoMode, setDemoMode } from './demo/mode'
import { GuestFeatureProvider, useGuestFeature } from './guest/GuestFeatureProvider'
import AuthCallback from './pages/AuthCallback'
import Budget from './pages/Budget'
import CashFlow from './pages/CashFlow'
import AuthRequiredScreen from './components/AuthRequiredScreen'
import Dashboard from './pages/Dashboard'
import Subscriptions from './pages/Subscriptions'
import './App.css'

type NavItem = {
  to: string
  label: string
  icon: 'dashboard' | 'cashflow' | 'budget' | 'subscriptions'
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/cash-flow', label: 'Cash Flow', icon: 'cashflow' },
  { to: '/budget', label: 'Budget', icon: 'budget' },
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
  const auth = useAuth()
  const guestFeature = useGuestFeature()
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

  const dispatchDashboardEvent = (name: 'app:view-reports' | 'app:upload-statements') => {
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
      queryClient.clear()
    }
    window.addEventListener('demo-mode-changed', onDemoModeChanged)
    return () => window.removeEventListener('demo-mode-changed', onDemoModeChanged)
  }, [queryClient])

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_PREF_KEY, sidebarCollapsed ? '1' : '0')
    } catch {
      // Ignore persistence errors.
    }
  }, [sidebarCollapsed])

  const enableGuestDemoMode = () => {
    if (!getDemoMode()) {
      resetDemoState()
    }
    setDemoMode(true)
    setDemoModeEnabled(true)
    queryClient.clear()
  }

  const currentReturnPath =
    `${location.pathname}${location.search}${location.hash}` || '/'
  const signInReturnPath = currentReturnPath.startsWith('/auth/callback')
    ? '/'
    : currentReturnPath

  const authLabel =
    auth.claims?.email || auth.claims?.name || auth.claims?.given_name || 'Signed in'
  const isAuthCallback = location.pathname === '/auth/callback'
  const isGuestDemo = demoModeEnabled && guestFeature.isGuestDemo
  const requiresSignIn =
    auth.isConfigured && !auth.isSignedIn && !demoModeEnabled && !isAuthCallback

  useEffect(() => {
    if (!auth.isSignedIn || !demoModeEnabled) return
    setDemoMode(false)
    setDemoModeEnabled(false)
    queryClient.clear()
  }, [auth.isSignedIn, demoModeEnabled, queryClient])

  if (isAuthCallback) {
    return <AuthCallback />
  }

  if (requiresSignIn) {
    return (
      <AuthRequiredScreen
        error={auth.error}
        onSignIn={() => void auth.signIn(signInReturnPath)}
        onGuestDemo={enableGuestDemoMode}
      />
    )
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
            {auth.isConfigured && (
              <>
                {auth.isSignedIn && <span className="header-auth-label">{authLabel}</span>}
                <button
                  type="button"
                  className="header-button secondary"
                  onClick={() => {
                    if (auth.isSignedIn) {
                      queryClient.clear()
                      auth.signOut()
                      return
                    }
                    if (demoModeEnabled) {
                      setDemoMode(false)
                      setDemoModeEnabled(false)
                      queryClient.clear()
                    }
                    void auth.signIn(signInReturnPath)
                  }}
                >
                  {auth.isSignedIn ? 'Sign Out' : 'Sign In'}
                </button>
              </>
            )}
            <button
              type="button"
              className="header-button secondary"
              onClick={() => dispatchDashboardEvent('app:view-reports')}
            >
              View Reports
            </button>
            <button
              type="button"
              className={`header-button ${isGuestDemo ? 'secondary' : 'primary'}`}
              onClick={() => {
                if (isGuestDemo) {
                  guestFeature.showGuestFeature({
                    title: 'Sign in to unlock uploads',
                    message:
                      'Guest Demo uses sample transactions only. Sign in with email or Google to upload statements and save your own finance data.',
                  })
                  return
                }
                dispatchDashboardEvent('app:upload-statements')
              }}
            >
              {isGuestDemo ? 'Uploads Locked' : 'Upload Statements'}
            </button>
          </div>
        </header>

        <main className="workspace-main">
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  canEnableDemo={!auth.isConfigured || !auth.isSignedIn}
                  demoModeEnabled={demoModeEnabled}
                  onEnableDemoMode={enableGuestDemoMode}
                />
              }
            />
            <Route path="/cash-flow" element={<CashFlow />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
          </Routes>
        </main>
      </section>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GuestFeatureProvider>
          <AppShell />
        </GuestFeatureProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
