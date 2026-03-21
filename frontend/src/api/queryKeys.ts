export const queryKeys = {
  ledger: ['ledger'] as const,
  transfers: ['transfers'] as const,
  pnl: {
    monthly: ['pnl', 'monthly'] as const,
    yearly: ['pnl', 'yearly'] as const,
    categories: ['pnl', 'categories'] as const,
  },
  budget: {
    list: ['budget'] as const,
    vsActual: ['budget', 'vs-actual'] as const,
  },
} as const
