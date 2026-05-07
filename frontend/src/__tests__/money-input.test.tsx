import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import MoneyInput, {
  formatMoneyInputValue,
  parseMoneyInputValue,
} from '../components/primitives/MoneyInput'

describe('MoneyInput', () => {
  it('parses formatted dollar values', () => {
    expect(parseMoneyInputValue('$1,234.56')).toBe(1234.56)
  })

  it('rejects non-numeric values', () => {
    expect(parseMoneyInputValue('12abc')).toBeNull()
    expect(parseMoneyInputValue('not money')).toBeNull()
  })

  it('returns null for empty or partial input', () => {
    expect(parseMoneyInputValue('')).toBeNull()
    expect(parseMoneyInputValue('.')).toBeNull()
  })

  it('preserves user-typed decimal drafts during entry', () => {
    expect(parseMoneyInputValue('1234.')).toBe(1234)
    expect(formatMoneyInputValue(1234.56)).toBe('1,234.56')
  })

  it('formats null as an empty draft', () => {
    expect(formatMoneyInputValue(null)).toBe('')
  })

  it('serializes named fields as raw numeric values', () => {
    const html = renderToStaticMarkup(
      <MoneyInput name="monthly_budget" value={1234.56} onValueChange={() => undefined} />,
    )

    expect(html).toContain('name="monthly_budget"')
    expect(html).toContain('type="hidden"')
    expect(html).toContain('value="1234.56"')
    expect(html).toContain('inputMode="decimal"')
    expect(html).toContain('value="1,234.56"')
    expect(html).toContain('$')
  })

  it('renders an empty hidden value when the controlled value is null', () => {
    const html = renderToStaticMarkup(
      <MoneyInput name="goal_amount" value={null} onValueChange={() => undefined} />,
    )

    expect(html).toContain('name="goal_amount"')
    expect(html).toContain('type="hidden"')
    expect(html).toMatch(/type="hidden"[^>]*value=""/)
  })

  it('keeps the hidden input enabled even when the visible input is disabled', () => {
    const html = renderToStaticMarkup(
      <MoneyInput name="amount" value={42} onValueChange={() => undefined} disabled />,
    )

    // Disabled inputs are excluded from form submission, so the hidden mirror
    // must remain enabled to preserve the value across submits.
    const hiddenMatch = html.match(/<input[^>]*type="hidden"[^>]*>/)
    expect(hiddenMatch).not.toBeNull()
    expect(hiddenMatch?.[0]).not.toContain('disabled')
  })

  it('renders the visible input as text, not number, so wheel events do not change the value', () => {
    const html = renderToStaticMarkup(<MoneyInput value={10} onValueChange={() => undefined} />)
    expect(html).toContain('type="text"')
    expect(html).not.toMatch(/type="number"/)
  })
})
