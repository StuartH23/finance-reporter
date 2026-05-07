import { type InputHTMLAttributes, useEffect, useState } from 'react'

type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'inputMode' | 'prefix'
> & {
  value: number | null
  onValueChange: (value: number | null) => void
  digits?: number
}

export function parseMoneyInputValue(value: string): number | null {
  const normalized = value.replace(/[$,\s]/g, '')
  if (normalized === '' || normalized === '.') return null
  if (!/^\d*(?:\.\d*)?$/.test(normalized)) return null

  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export function formatMoneyInputValue(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return ''
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function clampToBounds(
  value: number,
  min: InputHTMLAttributes<HTMLInputElement>['min'],
  max: InputHTMLAttributes<HTMLInputElement>['max'],
): number {
  let next = value
  if (min !== undefined && min !== '') {
    const minNum = typeof min === 'number' ? min : Number(min)
    if (Number.isFinite(minNum)) next = Math.max(next, minNum)
  }
  if (max !== undefined && max !== '') {
    const maxNum = typeof max === 'number' ? max : Number(max)
    if (Number.isFinite(maxNum)) next = Math.min(next, maxNum)
  }
  return next
}

function MoneyInput({
  value,
  onValueChange,
  digits = 2,
  className,
  name,
  min,
  max,
  onBlur,
  onFocus,
  ...props
}: MoneyInputProps) {
  const [draft, setDraft] = useState(() => formatMoneyInputValue(value, digits))
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (isFocused) return
    setDraft(formatMoneyInputValue(value, digits))
  }, [value, digits, isFocused])

  const emit = (raw: number | null) => {
    if (raw === null) {
      onValueChange(null)
      return
    }
    onValueChange(roundTo(clampToBounds(raw, min, max), digits))
  }

  return (
    <span className="money-input">
      <span className="money-input-prefix" aria-hidden="true">
        $
      </span>
      {name && (
        <input
          type="hidden"
          name={name}
          value={value === null || !Number.isFinite(value) ? '' : value.toFixed(digits)}
        />
      )}
      <input
        {...props}
        name={undefined}
        type="text"
        inputMode="decimal"
        value={draft}
        min={min}
        max={max}
        className={['money-input-field', className ?? ''].filter(Boolean).join(' ')}
        onChange={(event) => {
          const nextDraft = event.target.value
          setDraft(nextDraft)
          if (nextDraft.trim() === '') {
            emit(null)
            return
          }
          const parsed = parseMoneyInputValue(nextDraft)
          if (parsed !== null) {
            emit(parsed)
          }
        }}
        onBlur={(event) => {
          const parsed = parseMoneyInputValue(event.target.value)
          setIsFocused(false)
          if (parsed === null) {
            setDraft(formatMoneyInputValue(value, digits))
          } else {
            const clamped = roundTo(clampToBounds(parsed, min, max), digits)
            setDraft(formatMoneyInputValue(clamped, digits))
          }
          onBlur?.(event)
        }}
        onFocus={(event) => {
          setIsFocused(true)
          onFocus?.(event)
        }}
      />
    </span>
  )
}

export default MoneyInput
