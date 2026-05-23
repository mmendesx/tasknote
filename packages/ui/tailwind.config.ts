import type { Config } from 'tailwindcss'

/**
 * Tailwind v4 config for @tasknote/ui.
 * All color values reference CSS custom properties from tokens.css —
 * no hex values are hardcoded here.
 */
const config: Config = {
  content: [
    './src/**/*.{vue,ts,tsx}',
    '../../apps/web/src/**/*.{vue,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-elevated': 'var(--color-surface-elevated)',
        border: 'var(--color-border)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
        },
        status: {
          todo: 'var(--color-status-todo)',
          doing: 'var(--color-status-doing)',
          blocked: 'var(--color-status-blocked)',
          done: 'var(--color-status-done)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        xs:   ['var(--text-xs)',   { lineHeight: 'var(--leading-body)' }],
        sm:   ['var(--text-sm)',   { lineHeight: 'var(--leading-body)' }],
        base: ['var(--text-base)', { lineHeight: 'var(--leading-body)' }],
        lg:   ['var(--text-lg)',   { lineHeight: 'var(--leading-heading)' }],
        xl:   ['var(--text-xl)',   { lineHeight: 'var(--leading-heading)' }],
        '2xl':['var(--text-2xl)', { lineHeight: 'var(--leading-heading)' }],
      },
      spacing: {
        1:  'var(--space-1)',
        2:  'var(--space-2)',
        3:  'var(--space-3)',
        4:  'var(--space-4)',
        6:  'var(--space-6)',
        8:  'var(--space-8)',
        12: 'var(--space-12)',
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card:    'var(--radius-card)',
        modal:   'var(--radius-modal)',
      },
      transitionDuration: {
        fast: 'var(--motion-duration-fast)',
        base: 'var(--motion-duration-base)',
      },
      ringColor: {
        focus: 'var(--color-focus-ring)',
      },
    },
  },
  plugins: [],
}

export default config
