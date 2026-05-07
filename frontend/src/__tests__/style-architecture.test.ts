// @ts-expect-error - Vitest runs in Node, but the frontend tsconfig omits Node typings.
import { readFileSync } from 'node:fs'
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
  'pages/CashFlow.tsx',
  'components/SpendingPieChart.tsx',
  'components/SubscriptionCenter.tsx',
])

const hexColorAllowlist = new Set([
  'styles/tokens.css',
  'components/SpendingPieChart.tsx',
  'components/CashFlowSankeyChart.tsx',
])

const tokensCss = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')

const requiredTokens = [
  '--font-display',
  '--font-h1',
  '--font-h2',
  '--font-eyebrow',
  '--font-body',
  '--font-small',
  '--metric-xl',
  '--metric-md',
  '--metric-sm',
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--weight-regular',
  '--weight-medium',
  '--weight-semibold',
  '--weight-bold',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
  '--chart-7',
  '--chart-8',
  '--chart-positive',
  '--chart-negative',
  '--card-grad-from',
  '--card-grad-to',
  '--row-hover-bg',
  '--chip-border',
]

const requiredLightTokens = [
  '--bg',
  '--surface',
  '--surface-muted',
  '--border',
  '--border-strong',
  '--text',
  '--text-secondary',
  '--text-muted',
  '--accent',
  '--accent-soft',
  '--hover-surface',
  '--active-surface',
  '--mobile-nav-bg',
  '--shadow-card',
]

function sourceFiles(): SourceFile[] {
  return Object.entries(modules).map(([path, text]) => ({
    rel: path.replace(/^\.\.\//, ''),
    text: path.endsWith('.css') ? readFileSync(new URL(path, import.meta.url), 'utf8') : text,
  }))
}

function tokenHex(name: string): string {
  const match = tokensCss.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`))

  if (!match) {
    throw new Error(`Missing hex token ${name}`)
  }

  return match[1]
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)

  return (lighter + 0.05) / (darker + 0.05)
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

  it('defines the shared UI tokens used by component styles', () => {
    const missing = requiredTokens.filter((token) => !tokensCss.includes(`${token}:`))

    expect(missing).toEqual([])
  })

  it('defines light-mode overrides without changing the dark root defaults', () => {
    const lightThemeMatch = tokensCss.match(/\[data-theme="light"\]\s*\{(?<body>[\s\S]*?)\n {2}\}/)
    const lightThemeBody = lightThemeMatch?.groups?.body ?? ''
    const missing = requiredLightTokens.filter((token) => !lightThemeBody.includes(`${token}:`))

    expect(lightThemeMatch).not.toBeNull()
    expect(missing).toEqual([])
    expect(tokenHex('--bg')).toBe('#030912')
    expect(tokenHex('--surface')).toBe('#070e1d')
  })

  it('keeps muted text readable on the default surface', () => {
    expect(contrastRatio(tokenHex('--text-muted'), tokenHex('--surface'))).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  it('keeps component CSS on radius tokens except for true pill radii', () => {
    const offenders = sourceFiles()
      .filter(({ rel }) => rel.startsWith('styles/components/') && rel.endsWith('.css'))
      .flatMap(({ rel, text }) =>
        [...text.matchAll(/border-radius:\s*([^;]+);/g)]
          .map((match) => match[1].trim())
          .filter((value) =>
            value
              .split(/\s+/)
              .some((part) => part !== '0' && part !== '999px' && !part.startsWith('var(')),
          )
          .map((value) => `${rel}: ${value}`),
      )

    expect(offenders).toEqual([])
  })

  it('does not use unsupported intermediate font weights', () => {
    const offenders = sourceFiles()
      .filter(({ text }) => /font-weight:\s*(650|750)\b/.test(text))
      .map(({ rel }) => rel)

    expect(offenders).toEqual([])
  })
})
