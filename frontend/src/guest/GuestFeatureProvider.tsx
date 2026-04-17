import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useAuth } from '../auth/AuthProvider'
import { getGuestDemoMode, setDemoMode } from '../demo/mode'

export type GuestFeaturePrompt = {
  title: string
  message: string
  signInLabel?: string
  dismissLabel?: string
}

type GuestFeatureContextValue = {
  isGuestDemo: boolean
  showGuestFeature: (prompt: GuestFeaturePrompt) => void
  guardGuestFeature: (prompt: GuestFeaturePrompt) => boolean
}

const defaultContext: GuestFeatureContextValue = {
  isGuestDemo: false,
  showGuestFeature: () => {},
  guardGuestFeature: () => false,
}

const GuestFeatureContext = createContext<GuestFeatureContextValue>(defaultContext)

export function GuestFeatureProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const [isGuestDemo, setIsGuestDemo] = useState(() => getGuestDemoMode())
  const [prompt, setPrompt] = useState<GuestFeaturePrompt | null>(null)

  useEffect(() => {
    const onDemoModeChanged = () => setIsGuestDemo(getGuestDemoMode())
    window.addEventListener('demo-mode-changed', onDemoModeChanged)
    return () => window.removeEventListener('demo-mode-changed', onDemoModeChanged)
  }, [])

  useEffect(() => {
    if (!prompt) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPrompt(null)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [prompt])

  const showGuestFeature = useCallback((nextPrompt: GuestFeaturePrompt) => {
    setPrompt(nextPrompt)
  }, [])

  const startSignIn = useCallback(() => {
    setPrompt(null)
    if (isGuestDemo) {
      setDemoMode(false)
      setIsGuestDemo(false)
    }
    void auth.signIn()
  }, [auth, isGuestDemo])

  const guardGuestFeature = useCallback(
    (nextPrompt: GuestFeaturePrompt) => {
      if (!isGuestDemo) return false
      setPrompt(nextPrompt)
      return true
    },
    [isGuestDemo],
  )

  const value = useMemo<GuestFeatureContextValue>(
    () => ({ isGuestDemo, showGuestFeature, guardGuestFeature }),
    [isGuestDemo, showGuestFeature, guardGuestFeature],
  )

  return (
    <GuestFeatureContext.Provider value={value}>
      {children}
      {prompt && (
        <div className="guest-modal-backdrop">
          <section
            className="guest-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-modal-title"
          >
            <button
              type="button"
              className="guest-modal-close"
              aria-label="Close"
              onClick={() => setPrompt(null)}
            >
              X
            </button>
            <h2 id="guest-modal-title">{prompt.title}</h2>
            <p>{prompt.message}</p>
            <div className="guest-modal-actions">
              {auth.isConfigured && (
                <button type="button" className="primary-button" onClick={startSignIn}>
                  {prompt.signInLabel ?? 'Sign In'}
                </button>
              )}
              <button type="button" className="ghost-button" onClick={() => setPrompt(null)}>
                {prompt.dismissLabel ?? 'Keep Browsing Demo'}
              </button>
            </div>
          </section>
        </div>
      )}
    </GuestFeatureContext.Provider>
  )
}

export function useGuestFeature() {
  return useContext(GuestFeatureContext)
}
