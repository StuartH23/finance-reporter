import { useQueryClient } from '@tanstack/react-query'
import { Moon, Sun } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { clearDemoSession, seedDemoSession } from './api/client'
import { type AppNavItem, getNavGroups, getNavItems } from './appNavigation'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import AuthRequiredScreen from './components/AuthRequiredScreen'
import { getDemoTransactions, resetDemoState } from './demo/demoApi'
import { getDemoMode, setDemoMode } from './demo/mode'
import { GuestFeatureProvider, useGuestFeature } from './guest/GuestFeatureProvider'
import AuthCallback from './pages/AuthCallback'
import Dashboard from './pages/Dashboard'

const Budget = lazy(() => import('./pages/Budget'))
const CashFlow = lazy(() => import('./pages/CashFlow'))
const Chat = lazy(() => import('./pages/Chat'))
const Goals = lazy(() => import('./pages/Goals'))
const Subscriptions = lazy(() => import('./pages/Subscriptions'))
const FileUploader = lazy(() => import('./components/FileUploader'))

const navGroups = getNavGroups()
const navItems = getNavItems()

const SIDEBAR_PREF_KEY = 'pnl-reporter.sidebar-collapsed'
const THEME_PREF_KEY = 'pnl-reporter.theme'

type AppTheme = 'dark' | 'light'

function getPreferredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark'

  const painted = document.documentElement.dataset.theme
  if (painted === 'dark' || painted === 'light') return painted

  try {
    const stored = window.localStorage.getItem(THEME_PREF_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // Ignore unavailable storage.
  }

  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function RouteFallback() {
  return (
    <section className="card route-loading" aria-label="Loading page">
      <p>Loading page...</p>
    </section>
  )
}

function UploadFallback() {
  return (
    <div className="card upload-card upload-card-loading" role="status" aria-live="polite">
      <p>Loading upload tools...</p>
    </div>
  )
}

function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="Mobile Navigation">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className="mobile-nav-link"
          aria-label={item.label}
        >
          <NavIcon icon={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function NavIcon({ icon }: { icon: AppNavItem['icon'] }) {
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

  if (icon === 'goals') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M16.5 7.5 20 4" />
      </svg>
    )
  }

  if (icon === 'chat') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16v10H7l-3 3V6z" />
        <path d="M8 10h8" />
        <path d="M8 13h5" />
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
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false)
  const [uploadOpenRequest, setUploadOpenRequest] = useState(0)
  const [theme, setTheme] = useState<AppTheme>(() => getPreferredTheme())
  const uploadSheetRef = useRef<HTMLElement>(null)
  const uploadCloseButtonRef = useRef<HTMLButtonElement>(null)
  const uploadOpenerRef = useRef<HTMLElement | null>(null)
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

  const openUploadSheet = () => {
    const active = document.activeElement
    uploadOpenerRef.current = active instanceof HTMLElement ? active : null
    setUploadSheetOpen(true)
    setUploadOpenRequest((request) => request + 1)
  }

  const dispatchDashboardEvent = (name: 'app:view-reports') => {
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem(THEME_PREF_KEY, theme)
    } catch {
      // Ignore persistence errors.
    }
  }, [theme])

  useEffect(() => {
    if (!uploadSheetOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    uploadCloseButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUploadSheetOpen(false)
        return
      }

      if (event.key !== 'Tab') return
      const focusable = uploadSheetRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      const opener = uploadOpenerRef.current
      if (opener && document.contains(opener)) {
        opener.focus()
      }
      uploadOpenerRef.current = null
    }
  }, [uploadSheetOpen])

  const enableGuestDemoMode = () => {
    if (!getDemoMode()) {
      resetDemoState()
    }
    setDemoMode(true)
    setDemoModeEnabled(true)
    queryClient.clear()
    void seedDemoSession(getDemoTransactions())
  }

  const currentReturnPath = `${location.pathname}${location.search}${location.hash}` || '/'
  const signInReturnPath = currentReturnPath.startsWith('/auth/callback') ? '/' : currentReturnPath

  const authLabel =
    auth.claims?.email || auth.claims?.name || auth.claims?.given_name || 'Signed in'
  const isAuthCallback = location.pathname === '/auth/callback'
  const isGuestDemo = demoModeEnabled && guestFeature.isGuestDemo
  const requiresSignIn =
    auth.isConfigured && !auth.isSignedIn && !demoModeEnabled && !isAuthCallback

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger, not read in the body.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    if (!auth.isSignedIn || !demoModeEnabled) return
    setDemoMode(false)
    setDemoModeEnabled(false)
    queryClient.clear()
    void clearDemoSession()
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
      <MobileNav />
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
          {navGroups.map((group) => (
            <div className="rail-nav-group" key={group.label ?? 'ask-ai'}>
              {group.label && <span className="rail-group-label">{group.label}</span>}
              {group.items.map((item) => (
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
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="breadcrumbs">
            <strong>{current?.label ?? 'Money Checkup'}</strong>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="header-button toggle"
              onClick={() =>
                setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
              }
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-pressed={theme === 'light'}
            >
              {theme === 'dark' ? (
                <Sun size={14} aria-hidden="true" />
              ) : (
                <Moon size={14} aria-hidden="true" />
              )}
            </button>
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
                      void clearDemoSession()
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
              className="header-button secondary hide-mobile"
              onClick={() => dispatchDashboardEvent('app:view-reports')}
            >
              View Reports
            </button>
            {!isGuestDemo && (
              <button type="button" className="header-button primary" onClick={openUploadSheet}>
                Upload Statements
              </button>
            )}
          </div>
        </header>

        <main className="workspace-main">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route
                path="/"
                element={
                  <Dashboard
                    canEnableDemo={!auth.isConfigured || !auth.isSignedIn}
                    canUpload={!isGuestDemo}
                    demoModeEnabled={demoModeEnabled}
                    onEnableDemoMode={enableGuestDemoMode}
                    onUploadStatements={openUploadSheet}
                  />
                }
              />
              <Route path="/cash-flow" element={<CashFlow />} />
              <Route path="/budget" element={<Budget />} />
              <Route path="/subscriptions" element={<Subscriptions />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/goals" element={<Goals />} />
            </Routes>
          </Suspense>
        </main>
        {uploadSheetOpen && (
          <div className="upload-sheet-backdrop">
            <button
              type="button"
              className="upload-sheet-backdrop-dismiss"
              aria-label="Close upload"
              tabIndex={-1}
              onClick={() => setUploadSheetOpen(false)}
            />
            <section
              ref={uploadSheetRef}
              className="upload-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Upload statements"
            >
              <div className="upload-sheet-header">
                <strong>Upload Statements</strong>
                <button
                  ref={uploadCloseButtonRef}
                  type="button"
                  className="ghost-button"
                  onClick={() => setUploadSheetOpen(false)}
                  aria-label="Close upload"
                >
                  Close
                </button>
              </div>
              <Suspense fallback={<UploadFallback />}>
                <FileUploader openRequest={uploadOpenRequest} />
              </Suspense>
            </section>
          </div>
        )}
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
