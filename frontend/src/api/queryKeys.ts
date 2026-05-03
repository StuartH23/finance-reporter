export const queryKeys = {
  ledger: ['ledger'] as const,
  transfers: ['transfers'] as const,
  pnl: {
    monthly: ['pnl', 'monthly'] as const,
    yearly: ['pnl', 'yearly'] as const,
    categories: ['pnl', 'categories'] as const,
    categoriesByYear: (year?: number | null) => ['pnl', 'categories', year ?? 'all'] as const,
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
    upcoming: (params?: { statusGroup?: 'active' | 'inactive'; limit?: number }) =>
      [
        'subscriptions',
        'upcoming',
        params?.statusGroup ?? 'active',
        params?.limit ?? 'all',
      ] as const,
    alerts: ['subscriptions', 'alerts'] as const,
    cancelInfo: (streamId: string) => ['subscriptions', 'cancel-info', streamId] as const,
    review: (streamId: string) => ['subscriptions', 'review', streamId] as const,
  },
  actions: {
    feed: ['actions', 'feed'] as const,
  },
} as const
