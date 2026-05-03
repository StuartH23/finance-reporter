import { describe, expect, it } from 'vitest'
import { getNavItems } from '../appNavigation'

describe('app navigation', () => {
  it('includes the stable goals route', () => {
    const items = getNavItems()
    expect(items.some((item) => item.to === '/goals' && item.label === 'Goals')).toBe(true)
  })
})
