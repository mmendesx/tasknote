import { animate as animeAnimate } from 'animejs'
import { useReducedMotion } from './useReducedMotion'

// Derive the type from the function signature to avoid relying on a named
// export whose identifier may change across anime.js v4 minor versions.
type AnimeTargets = Parameters<typeof animeAnimate>[0]
type AnimeOptions = Parameters<typeof animeAnimate>[1]

/**
 * useAnime — wraps anime.js v4 `animate()` with prefers-reduced-motion support.
 *
 * When the user has requested reduced motion, all JS-driven animation
 * durations are collapsed to 0 (instant). CSS token overrides handle
 * CSS animations separately via tokens.css.
 */
export function useAnime() {
  const prefersReducedMotion = useReducedMotion()

  function animate(targets: AnimeTargets, options: AnimeOptions) {
    return animeAnimate(targets, {
      ...options,
      duration: prefersReducedMotion.value ? 0 : ((options as Record<string, unknown>).duration as number ?? 300),
    })
  }

  return { animate, prefersReducedMotion }
}

/**
 * animateOrSkip — convenience helper for one-off animations outside
 * a component setup context. Checks reduced motion via matchMedia directly.
 */
export function animateOrSkip(targets: AnimeTargets, options: AnimeOptions) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return animeAnimate(targets, {
    ...options,
    duration: prefersReduced ? 0 : ((options as Record<string, unknown>).duration as number ?? 300),
  })
}
