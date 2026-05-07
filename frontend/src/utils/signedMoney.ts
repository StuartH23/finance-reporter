export function formatUnsignedMoney(value: number, digits = 0): string {
  return `$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

export function formatSignedMoney(value: number, digits = 0): string {
  if (Object.is(value, 0) || Math.abs(value) < 0.005) return formatUnsignedMoney(0, digits)
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${formatUnsignedMoney(value, digits)}`
}
