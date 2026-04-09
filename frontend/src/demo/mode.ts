const DEMO_MODE_KEY = 'finance-reporter.demo_mode'

export function getDemoMode(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(DEMO_MODE_KEY) === 'true'
}

export function setDemoMode(enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEMO_MODE_KEY, enabled ? 'true' : 'false')
  window.dispatchEvent(new CustomEvent('demo-mode-changed', { detail: enabled }))
}
