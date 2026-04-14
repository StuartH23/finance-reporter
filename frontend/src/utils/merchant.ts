const MERCHANT_LABEL_MAX_LENGTH = 60

export function normalizeMerchantLabel(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized.length) return 'Unknown Merchant'
  return normalized.slice(0, MERCHANT_LABEL_MAX_LENGTH)
}
