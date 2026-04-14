export const queryKeys = {
  ledger: ['ledger'] as const,
  transfers: ['transfers'] as const,
  pnl: {
    monthly: ['pnl', 'monthly'] as const,
    yearly: ['pnl', 'yearly'] as const,
    categories: ['pnl', 'categories'] as const,
  },
  cashflow: {
    byParams: (params?: {
      granularity?: 'month' | 'quarter'
      groupBy?: 'category' | 'merchant'
      period?: string
    }) =>
      [
        'cashflow',
        params?.granularity ?? 'month',
        params?.groupBy ?? 'category',
        params?.period ?? 'latest',
      ] as const,
  },
  insights: ['insights'] as const,
  budget: {
    list: ['budget'] as const,
    vsActual: ['budget', 'vs-actual'] as const,
  },
  goals: {
    list: ['goals'] as const,
    paycheckPlan: ['goals', 'paycheck-plan'] as const,
    savedPlan: ['goals', 'saved-plan'] as const,
  },
  subscriptions: {
    list: ['subscriptions'] as const,
    alerts: ['subscriptions', 'alerts'] as const,
  },
  actions: {
    feed: ['actions', 'feed'] as const,
  },
} as const
