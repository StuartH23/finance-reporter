import { describe, expect, it } from 'vitest'
import { parseStoredAnalystMessages, readStoredAnalystMessages } from '../api/schemas'

describe('stored analyst messages', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(readStoredAnalystMessages(null)).toEqual([])
    expect(parseStoredAnalystMessages(null)).toEqual({ status: 'empty' })
  })

  it('keeps a valid history', () => {
    const raw = JSON.stringify([
      { role: 'user', content: 'How much did I spend?' },
      { role: 'assistant', content: 'About $40.' },
    ])
    expect(readStoredAnalystMessages(raw)).toEqual([
      { role: 'user', content: 'How much did I spend?' },
      { role: 'assistant', content: 'About $40.' },
    ])
  })

  it('treats corrupted or malformed history as empty instead of throwing', () => {
    expect(readStoredAnalystMessages('{not json')).toEqual([])
    expect(parseStoredAnalystMessages('{not json')).toEqual({ status: 'invalid' })
    expect(readStoredAnalystMessages(JSON.stringify({ role: 'user', content: 'nope' }))).toEqual([])
    expect(
      readStoredAnalystMessages(JSON.stringify([{ role: 'system', content: 'nope' }])),
    ).toEqual([])
  })
})
