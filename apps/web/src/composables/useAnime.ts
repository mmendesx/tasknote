import { animate as animeAnimate } from 'animejs'
import { useReducedMotion } from './useReducedMotion'

type AnimeTargets = Parameters<typeof animeAnimate>[0]
type AnimeOptions = Parameters<typeof animeAnimate>[1]

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

export function animateOrSkip(targets: AnimeTargets, options: AnimeOptions) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return animeAnimate(targets, {
    ...options,
    duration: prefersReduced ? 0 : ((options as Record<string, unknown>).duration as number ?? 300),
  })
}
