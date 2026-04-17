import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import FileUploader from '../components/FileUploader'
import PrivacyNotice from '../components/PrivacyNotice'

describe('privacy copy', () => {
  it('shows modal-prompt upload copy', () => {
    const queryClient = new QueryClient()
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <FileUploader />
      </QueryClientProvider>,
    )

    expect(html).toContain('Statement Upload')
    expect(html).toContain('Upload CSV or PDF statements when you want to use your own data.')
    expect(html).toContain('Upload Statements')
    expect(html).toContain('Upload Options')
    expect(html).not.toContain('Drop CSV or PDF files here, or click to browse')
  })

  it('shows architecture-specific privacy notice sections', () => {
    const html = renderToStaticMarkup(<PrivacyNotice />)

    expect(html).toContain('Last updated: March 21, 2026')
    expect(html).toContain('1. File uploads (/api/upload)')
    expect(html).toContain('2. Session data in memory')
    expect(html).toContain('3. Data written to disk by this app')
    expect(html).toContain('backend/data/budget.csv')
    expect(html).toContain('backend/data/feature_interest.csv')
    expect(html).toContain('session_id')
    expect(html).toContain('5. Scope note')
  })

  it('shows acceptance control when explicitly enabled', () => {
    const html = renderToStaticMarkup(
      <PrivacyNotice accepted={false} onAcceptedChange={() => {}} showAcceptanceControl />,
    )
    expect(html).toContain('I have read and accept this Privacy Notice for statement uploads.')
  })
})
