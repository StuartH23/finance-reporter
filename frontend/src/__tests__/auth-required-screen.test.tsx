import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import AuthRequiredScreen from '../components/AuthRequiredScreen'

describe('auth required screen', () => {
  it('renders redirect state with guest escape hatch', () => {
    const html = renderToStaticMarkup(
      <AuthRequiredScreen onSignIn={() => {}} onGuestDemo={() => {}} />,
    )

    expect(html).toContain('Redirecting to sign in')
    expect(html).toContain('Continue as Guest Demo')
    expect(html).toContain('/screenshots/preview-dashboard.svg')
  })

  it('renders error state with retry and guest options', () => {
    const html = renderToStaticMarkup(
      <AuthRequiredScreen
        error="Browser session storage is required for login."
        onSignIn={() => {}}
        onGuestDemo={() => {}}
      />,
    )

    expect(html).toContain('Unable to sign in')
    expect(html).toContain('Browser session storage is required for login.')
    expect(html).toContain('Try Again')
    expect(html).toContain('Continue as Guest Demo')
  })
})
