import type { Config } from 'tailwindcss'
import uiConfig from '../../packages/ui/tailwind.config'

/**
 * apps/web Tailwind config — extends the shared @tasknote/ui config.
 * Content globs include both the app source and the ui package source
 * so class scanning covers all component files.
 */
const config: Config = {
  ...uiConfig,
  content: [
    './src/**/*.{vue,ts,tsx}',
    '../../packages/ui/src/**/*.{vue,ts,tsx}',
  ],
}

export default config
