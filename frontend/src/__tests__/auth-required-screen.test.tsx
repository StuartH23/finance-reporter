import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import AuthRequiredScreen from '../components/AuthRequiredScreen'

describe('auth required screen', () => {
  it('renders the sign-in and guest entry points', () => {
    const html = renderToStaticMarkup(
      <AuthRequiredScreen onSignIn={() => {}} onGuestDemo={() => {}} />,
    )

    expect(html).toContain('Sign in to continue')
    expect(html).toContain('Sign In')
    expect(html).toContain('Continue as Guest Demo')
    expect(html).toContain('/screenshots/preview-dashboard.svg')
  })

  it('renders auth startup errors', () => {
    const html = renderToStaticMarkup(
      <AuthRequiredScreen
        error="Browser session storage is required for login."
        onSignIn={() => {}}
        onGuestDemo={() => {}}
      />,
    )

    expect(html).toContain('Browser session storage is required for login.')
  })
})
