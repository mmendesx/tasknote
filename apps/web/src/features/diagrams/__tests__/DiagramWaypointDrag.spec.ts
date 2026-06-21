import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useResize } from '../useResize'
import { useCanvasPointer } from '../useCanvasPointer'
import { useDrawState } from '../useDrawTools'
import { useSelection } from '../useSelection'
import { useMarquee } from '../useMarquee'
import { useDiagramsStore } from '@/stores/diagrams'
import type { DiagramElement, DiagramViewport } from '@tasknote/shared'

// ── API mock ──────────────────────────────────────────────────────────────────

vi.mock('@/api', () => ({
  diagrams: {
    getDiagram: vi.fn().mockResolvedValue({
      id: 1,
      title: 'Test',
      scene_json: {
        version: 1,
        elements: [],
        appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
      },
    }),
    updateDiagram: vi.fn().mockResolvedValue({}),
  },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeArrow(overrides: Record<string, unknown> = {}): DiagramElement {
  return {
    id: 'arrow-1',
    type: 'arrow',
    points: [[0, 0], [200, 0]] as [[number, number], [number, number]],
    stroke: '#000',
    strokeWidth: 2,
    waypoints: [],
    routeMode: 'auto',
    ...overrides,
  } as unknown as DiagramElement
}

const defaultViewport: DiagramViewport = { scrollX: 0, scrollY: 0, zoom: 1 }

function makeResize(elements: DiagramElement[], viewport: DiagramViewport = defaultViewport) {
  return useResize(() => elements, () => viewport)
}

// ── Waypoint patch logic ──────────────────────────────────────────────────────

describe('useResize — waypoint drag patch logic', () => {
  it('beginWaypointDrag + updateResize (segment) inserts waypoint at segment midpoint + delta', () => {
    // Route: [[0,0], [200,0]] — segment 0 midpoint = (100, 0)
    const arrow = makeArrow({ waypoints: [], routeMode: 'auto' })
    const resize = makeResize([arrow])

    // Begin dragging segment 0
    resize.beginWaypointDrag('arrow-1', 'segment', 0, 0, 0)

    // Move 10px right, 30px down in screen space (zoom=1 → same in scene)
    const patch = resize.updateResize(10, 30)
    expect(patch).not.toBeNull()
    const waypoints = (patch as any).waypoints as [number, number][]
    expect(waypoints).toHaveLength(1)
    // Midpoint (100, 0) + delta (10, 30) = (110, 30)
    expect(waypoints[0]![0]).toBeCloseTo(110)
    expect(waypoints[0]![1]).toBeCloseTo(30)
    expect((patch as any).routeMode).toBe('manual')
  })

  it('inserts waypoint at the correct index for a segment in the middle of the route', () => {
    // Route: [[0,0], wp[100,0], wp[100,100], [200,100]]
    // segment 1 connects wp[100,0] → wp[100,100], midpoint = (100, 50)
    const arrow = makeArrow({
      waypoints: [[100, 0], [100, 100]],
      routeMode: 'manual',
    })
    const resize = makeResize([arrow])

    resize.beginWaypointDrag('arrow-1', 'segment', 1, 0, 0)
    const patch = resize.updateResize(20, 0) // 20px right, 0 down

    const waypoints = (patch as any).waypoints as [number, number][]
    // Expected: 3 waypoints — insert before index 1
    expect(waypoints).toHaveLength(3)
    expect(waypoints[0]).toEqual([100, 0])
    // New waypoint at midpoint(100,0)→(100,100) + delta(20,0) = (120, 50)
    expect(waypoints[1]![0]).toBeCloseTo(120)
    expect(waypoints[1]![1]).toBeCloseTo(50)
    expect(waypoints[2]).toEqual([100, 100])
  })

  it('commitResize (segment) clears waypointDragState and returns patch', () => {
    const arrow = makeArrow({ waypoints: [], routeMode: 'auto' })
    const resize = makeResize([arrow])

    resize.beginWaypointDrag('arrow-1', 'segment', 0, 0, 0)
    expect(resize.isResizing.value).toBe(true)

    const result = resize.commitResize(15, 20)
    expect(result).not.toBeNull()
    expect((result!.patch as any).routeMode).toBe('manual')
    expect(resize.isResizing.value).toBe(false)
    expect(resize.waypointDragState.value).toBeNull()
  })

  it('beginWaypointDrag + updateResize (waypoint) moves the existing waypoint', () => {
    // Route: [[0,0], wp[50,50], wp[150,50], [200,0]]
    const arrow = makeArrow({
      waypoints: [[50, 50], [150, 50]],
      routeMode: 'manual',
    })
    const resize = makeResize([arrow])

    // Drag waypoint at index 1 (currently at [150,50])
    resize.beginWaypointDrag('arrow-1', 'waypoint', 1, 0, 0)
    const patch = resize.updateResize(-10, 25) // move left 10, down 25

    const waypoints = (patch as any).waypoints as [number, number][]
    expect(waypoints).toHaveLength(2)
    expect(waypoints[0]).toEqual([50, 50]) // unchanged
    expect(waypoints[1]![0]).toBeCloseTo(140) // 150 - 10
    expect(waypoints[1]![1]).toBeCloseTo(75)  // 50 + 25
    expect((patch as any).routeMode).toBe('manual')
  })

  it('cancelResize clears waypointDragState', () => {
    const arrow = makeArrow({ waypoints: [], routeMode: 'auto' })
    const resize = makeResize([arrow])

    resize.beginWaypointDrag('arrow-1', 'segment', 0, 0, 0)
    expect(resize.isResizing.value).toBe(true)

    resize.cancelResize()
    expect(resize.isResizing.value).toBe(false)
    expect(resize.waypointDragState.value).toBeNull()
  })

  it('isResizing is true during waypoint drag and false otherwise', () => {
    const arrow = makeArrow({ waypoints: [], routeMode: 'auto' })
    const resize = makeResize([arrow])

    expect(resize.isResizing.value).toBe(false)
    resize.beginWaypointDrag('arrow-1', 'segment', 0, 0, 0)
    expect(resize.isResizing.value).toBe(true)
    resize.cancelResize()
    expect(resize.isResizing.value).toBe(false)
  })
})

// ── One undo entry (via real pointer flow) ────────────────────────────────────

/**
 * Build a minimal pointer event stub for useCanvasPointer.
 * We only need clientX/clientY and pointerId.
 */
function makePointerEvent(clientX: number, clientY: number): PointerEvent {
  return { clientX, clientY, pointerId: 1, target: null } as unknown as PointerEvent
}

describe('waypoint drag produces one undo entry — real pointer flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('onCanvasPointerMove pushes history once, undoAction restores pre-drag state', () => {
    const store = useDiagramsStore()
    const arrow = makeArrow({ waypoints: [], routeMode: 'auto' })
    ;(store as any).elements = [arrow]

    // Build composables
    const svgEl = ref<SVGSVGElement | null>(null)
    const resize = useResize(() => store.elements, () => store.viewport)
    const drawTools = useDrawState()
    const selection = useSelection()
    const marquee = useMarquee()
    const pointer = useCanvasPointer(store, svgEl, drawTools, selection, marquee, resize)

    // Simulate what DiagramCanvas does on @waypoint-drag-start:
    // 1. beginGestureHistory with current elements snapshot
    pointer.beginGestureHistory([...store.elements])
    // 2. beginWaypointDrag (segment 0 at screen origin 0,0)
    resize.beginWaypointDrag('arrow-1', 'segment', 0, 0, 0)

    // Expect isResizing to be true
    expect(resize.isResizing.value).toBe(true)
    expect(store.canUndo).toBe(false)

    // 3. First pointermove: pushGestureHistoryOnce fires, then updateElement
    pointer.onCanvasPointerMove(makePointerEvent(50, 30))

    // History should now be pushed (canUndo = true)
    expect(store.canUndo).toBe(true)

    // The element should be updated (waypoint inserted)
    const mid = store.elements.find((e: DiagramElement) => e.id === 'arrow-1')!
    expect((mid as any).routeMode).toBe('manual')
    expect((mid as any).waypoints).toHaveLength(1)

    // 4. pointerup: commitResize → final updateElement, endGestureHistory
    pointer.onCanvasPointerUp(makePointerEvent(60, 40))

    // Still one undo entry (history pushed only once on first move)
    expect(store.canUndo).toBe(true)

    // 5. undoAction restores pre-drag state
    store.undoAction()

    const restored = store.elements.find((e: DiagramElement) => e.id === 'arrow-1')!
    expect((restored as any).routeMode).toBe('auto')
    expect((restored as any).waypoints).toHaveLength(0)
  })
})
