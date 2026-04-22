import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { setAccessTokenProvider } from '../api/client'
import {
  type AuthClaims,
  beginCognitoSignIn,
  clearTokens,
  completeCognitoSignIn,
  getAccessToken,
  getSignedInClaims,
  isCognitoConfigured,
  loadTokens,
  signOutWithCognito,
} from './cognito'

type AuthStatus = 'configured' | 'signed-in' | 'signed-out' | 'not-configured'

type AuthContextValue = {
  status: AuthStatus
  claims: AuthClaims | null
  error: string | null
  isConfigured: boolean
  isSignedIn: boolean
  signIn: (returnPath?: string) => Promise<void>
  signOut: () => void
  completeSignIn: () => Promise<string>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function getStatus(): AuthStatus {
  if (!isCognitoConfigured()) return 'not-configured'
  return loadTokens() ? 'signed-in' : 'signed-out'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => getStatus())
  const [claims, setClaims] = useState<AuthClaims | null>(() => getSignedInClaims())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAccessTokenProvider(getAccessToken)
    setStatus(getStatus())
    setClaims(getSignedInClaims())
    return () => setAccessTokenProvider(null)
  }, [])

  const signIn = useCallback(async (returnPath?: string) => {
    setError(null)
    try {
      await beginCognitoSignIn(returnPath)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in could not start.'
      setError(message)
      setStatus(isCognitoConfigured() ? 'signed-out' : 'not-configured')
    }
  }, [])

  const signOut = useCallback(() => {
    clearTokens()
    setClaims(null)
    setStatus(isCognitoConfigured() ? 'signed-out' : 'not-configured')
    signOutWithCognito()
  }, [])

  const completeSignIn = useCallback(async () => {
    setError(null)
    try {
      const { returnPath } = await completeCognitoSignIn()
      setClaims(getSignedInClaims())
      setStatus('signed-in')
      return returnPath
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed.'
      setError(message)
      setStatus(isCognitoConfigured() ? 'signed-out' : 'not-configured')
      throw err
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      claims,
      error,
      isConfigured: status !== 'not-configured',
      isSignedIn: status === 'signed-in',
      signIn,
      signOut,
      completeSignIn,
    }),
    [status, claims, error, signIn, signOut, completeSignIn],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider.')
  return value
}
