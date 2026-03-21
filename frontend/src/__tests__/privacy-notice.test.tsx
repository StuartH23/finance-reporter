import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import FileUploader from '../components/FileUploader'
import PrivacyNotice from '../components/PrivacyNotice'

describe('privacy copy', () => {
  it('shows inline upload privacy notice and consent text', () => {
    const queryClient = new QueryClient()
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <FileUploader />
      </QueryClientProvider>
    )

    expect(html).toContain('We process uploaded CSV/PDF files in memory to generate your report.')
    expect(html).toContain('do not write the original uploaded PDF file to disk')
    expect(html).toContain(
      'I understand this tool processes files for budgeting help, does not store original uploaded PDF files'
    )
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
})
