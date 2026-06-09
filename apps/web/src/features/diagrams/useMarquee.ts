import { ref, computed } from 'vue'
import type { DiagramElement } from '@tasknote/shared'
import { computeElementBbox } from './useSelection'

export interface MarqueeRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Composable that tracks a marquee (rubber-band) selection rectangle in scene
 * coordinates. The caller is responsible for:
 *   1. Calling `startMarquee` on pointerdown on empty canvas.
 *   2. Calling `updateMarquee` on pointermove while the marquee is active.
 *   3. Calling `finishMarquee` on pointerup to get the intersecting element ids.
 *   4. Calling `cancelMarquee` on pointercancel.
 */
export function useMarquee() {
  const anchorX = ref(0)
  const anchorY = ref(0)
  const currentX = ref(0)
  const currentY = ref(0)
  const active = ref(false)

  /**
   * Normalized rectangle in scene coordinates, or null when no marquee is
   * being drawn. Width and height are always positive.
   */
  const marqueeRect = computed<MarqueeRect | null>(() => {
    if (!active.value) return null
    const x = Math.min(anchorX.value, currentX.value)
    const y = Math.min(anchorY.value, currentY.value)
    const width = Math.abs(currentX.value - anchorX.value)
    const height = Math.abs(currentY.value - anchorY.value)
    return { x, y, width, height }
  })

  function startMarquee(sceneX: number, sceneY: number): void {
    anchorX.value = sceneX
    anchorY.value = sceneY
    currentX.value = sceneX
    currentY.value = sceneY
    active.value = true
  }

  function updateMarquee(sceneX: number, sceneY: number): void {
    if (!active.value) return
    currentX.value = sceneX
    currentY.value = sceneY
  }

  /**
   * Finalize the marquee drag. Returns the ids of all elements whose bounding
   * boxes intersect the marquee rectangle.
   */
  function finishMarquee(elements: DiagramElement[]): string[] {
    if (!active.value) return []
    const rect = marqueeRect.value
    active.value = false
    if (!rect || rect.width < 2 || rect.height < 2) return []

    const hits: string[] = []
    for (const el of elements) {
      const bbox = computeElementBbox(el)
      const overlaps =
        bbox.x < rect.x + rect.width &&
        bbox.x + bbox.width > rect.x &&
        bbox.y < rect.y + rect.height &&
        bbox.y + bbox.height > rect.y
      if (overlaps) hits.push(el.id)
    }
    return hits
  }

  function cancelMarquee(): void {
    active.value = false
  }

  return {
    marqueeRect,
    active,
    startMarquee,
    updateMarquee,
    finishMarquee,
    cancelMarquee,
  }
}
