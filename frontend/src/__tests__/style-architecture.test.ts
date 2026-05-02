import { describe, expect, it } from 'vitest'

const modules = import.meta.glob('../**/*.{css,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

type SourceFile = {
  rel: string
  text: string
}

const styleInlineAllowlist = new Set([
  'components/SpendingPieChart.tsx',
  'components/SubscriptionCenter.tsx',
])

const hexColorAllowlist = new Set([
  'styles/tokens.css',
  'components/SpendingPieChart.tsx',
  'components/CashFlowSankeyChart.tsx',
])

function sourceFiles(): SourceFile[] {
  return Object.entries(modules).map(([path, text]) => ({
    rel: path.replace(/^\.\.\//, ''),
    text,
  }))
}

describe('style architecture guardrails', () => {
  it('keeps static CSS out of React component style tags', () => {
    const offenders = sourceFiles()
      .filter(({ rel }) => rel.endsWith('.tsx'))
      .filter(({ text }) => /<style[>\s]/.test(text))
      .map(({ rel }) => rel)

    expect(offenders).toEqual([])
  })

  it('keeps hard-coded hex UI colors in tokens or chart palettes only', () => {
    const offenders = sourceFiles()
      .filter(({ rel }) => !hexColorAllowlist.has(rel))
      .filter(({ text }) => /#[0-9a-fA-F]{3,8}\b/.test(text))
      .map(({ rel }) => rel)

    expect(offenders).toEqual([])
  })

  it('keeps inline styles limited to runtime chart or data-derived values', () => {
    const offenders = sourceFiles()
      .filter(({ rel }) => rel.endsWith('.tsx'))
      .filter(({ rel }) => !styleInlineAllowlist.has(rel))
      .filter(({ text }) => /style=\{\{/.test(text))
      .map(({ rel }) => rel)

    expect(offenders).toEqual([])
  })
})
