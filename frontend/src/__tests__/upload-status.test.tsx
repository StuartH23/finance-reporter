import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { UploadResultList } from '../components/FileUploader'

describe('upload result messages', () => {
  it('shows the parser reason for a failed PDF', () => {
    const html = renderToStaticMarkup(
      <UploadResultList
        files={[
          {
            file: 'scan.pdf',
            status: 'error',
            transactions: 0,
            message:
              'This PDF looks like a scanned image with no text layer. Upload a CSV, or a statement PDF that has selectable text.',
          },
        ]}
      />,
    )

    expect(html).toContain('scanned image with no text layer')
    expect(html).not.toContain('Failed')
  })

  it('falls back to Failed when a file has no reason', () => {
    const html = renderToStaticMarkup(
      <UploadResultList files={[{ file: 'notes.csv', status: 'error', transactions: 0 }]} />,
    )

    expect(html).toContain('Failed')
  })
})
