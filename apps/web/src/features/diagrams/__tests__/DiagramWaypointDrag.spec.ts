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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Assert every consecutive pair of points in the route shares x or y. */
function assertAxisAligned(route: [number, number][]): void {
  for (let i = 0; i < route.length - 1; i++) {
    const [x1, y1] = route[i]!
    const [x2, y2] = route[i + 1]!
    expect(
      x1 === x2 || y1 === y2,
      `Segment ${i}→${i + 1} is diagonal: (${x1},${y1})→(${x2},${y2})`,
    ).toBe(true)
  }
}

/** Build the full route from a patch. */
function fullRoute(
  patch: Partial<DiagramElement>,
  original: DiagramElement,
): [number, number][] {
  const pts = (original as any).points as [[number, number], [number, number]]
  const waypoints: [number, number][] = (patch as any).waypoints ?? []
  return [pts[0], ...waypoints, pts[1]]
}

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
  it('beginWaypointDrag + updateResize (segment) slides horizontal segment by dy, produces two axis-aligned corners', () => {
    // Route: [[0,0], [200,0]] — a horizontal segment (y=0)
    // Dragging by dx=10, dy=30 → horizontal seg slides to y=30; dx is ignored.
    // Expected corners: (0,30) and (200,30). Endpoint A=(0,0) and B=(200,0) stay fixed.
    const arrow = makeArrow({ waypoints: [], routeMode: 'auto' })
    const resize = makeResize([arrow])

    resize.beginWaypointDrag('arrow-1', 'segment', 0, 0, 0)

    const patch = resize.updateResize(10, 30)
    expect(patch).not.toBeNull()
    const waypoints = (patch as any).waypoints as [number, number][]
    expect(waypoints).toHaveLength(2)
    // Segment slides to y = 0 + 30 = 30; corners at A.x and B.x
    expect(waypoints[0]).toEqual([0, 30])
    expect(waypoints[1]).toEqual([200, 30])
    expect((patch as any).routeMode).toBe('manual')

    // Full route must be axis-aligned
    assertAxisAligned(fullRoute(patch!, arrow))
  })

  it('sliding a horizontal segment sets the new y correctly (dy asserted)', () => {
    // Route: [[0,100], [300,100]] — horizontal at y=100
    // Drag up by dy=-40 → new y = 60
    const arrow = makeArrow({
      points: [[0, 100], [300, 100]],
      waypoints: [],
      routeMode: 'auto',
    })
    const resize = makeResize([arrow])

    resize.beginWaypointDrag('arrow-1', 'segment', 0, 0, 0)
    const patch = resize.updateResize(50, -40) // dx=50 must be ignored

    const waypoints = (patch as any).waypoints as [number, number][]
    expect(waypoints[0]![1]).toBeCloseTo(60) // y = 100 + (-40)
    expect(waypoints[1]![1]).toBeCloseTo(60)
    assertAxisAligned(fullRoute(patch!, arrow))
  })

  it('sliding a vertical segment sets the new x correctly (dx asserted)', () => {
    // Route: [[100,0], [100,200]] — vertical at x=100
    // Drag right by dx=50 → new x = 150; dy is ignored
    const arrow = makeArrow({
      points: [[100, 0], [100, 200]],
      waypoints: [],
      routeMode: 'auto',
    })
    const resize = makeResize([arrow])

    resize.beginWaypointDrag('arrow-1', 'segment', 0, 0, 0)
    const patch = resize.updateResize(50, 99) // dy=99 must be ignored

    const waypoints = (patch as any).waypoints as [number, number][]
    expect(waypoints[0]![0]).toBeCloseTo(150) // x = 100 + 50
    expect(waypoints[1]![0]).toBeCloseTo(150)
    assertAxisAligned(fullRoute(patch!, arrow))
  })

  it('inserts two axis-aligned corners for a segment in the middle of the route', () => {
    // Route: [[0,0], wp[100,0], wp[100,100], [200,100]]
    // segment 1 connects route[1]=(100,0) → route[2]=(100,100) — a vertical segment
    // Drag dx=20, dy=99 → new x = 120; dy ignored
    // New waypoints: [100,0], [120,0], [120,100], [100,100]
    const arrow = makeArrow({
      points: [[0, 0], [200, 100]],
      waypoints: [[100, 0], [100, 100]],
      routeMode: 'manual',
    })
    const resize = makeResize([arrow])

    resize.beginWaypointDrag('arrow-1', 'segment', 1, 0, 0)
    const patch = resize.updateResize(20, 99)

    const waypoints = (patch as any).waypoints as [number, number][]
    expect(waypoints).toHaveLength(4)
    expect(waypoints[0]).toEqual([100, 0])
    expect(waypoints[1]![0]).toBeCloseTo(120) // new x
    expect(waypoints[1]![1]).toBeCloseTo(0)   // A.y preserved
    expect(waypoints[2]![0]).toBeCloseTo(120) // new x
    expect(waypoints[2]![1]).toBeCloseTo(100) // B.y preserved
    expect(waypoints[3]).toEqual([100, 100])

    assertAxisAligned(fullRoute(patch!, arrow))
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

  it('beginWaypointDrag + updateResize (waypoint) moves the corner freely and rebuilds adjacent legs as orthogonal', () => {
    // Route: [[0,0], wp[0,50], wp[200,50], [200,100]]
    // Corner at waypoint index 1 = (200,50). Drag dx=-60, dy=25 → Cnew=(140,75).
    // prev=[0,50]→corner=[200,50] was H → bend1=(140,50) [leave prev horizontally]
    // corner=[200,50]→next=[200,100] was V → bend2=(200,75) [exit next vertically]
    // New waypoints: [[0,50],[140,50],[140,75],[200,75]] (length 4)
    // Full route: [[0,0],[0,50],[140,50],[140,75],[200,75],[200,100]] — all axis-aligned
    const arrow = makeArrow({
      points: [[0, 0], [200, 100]],
      waypoints: [[0, 50], [200, 50]],
      routeMode: 'manual',
    })
    const resize = makeResize([arrow])

    resize.beginWaypointDrag('arrow-1', 'waypoint', 1, 0, 0)
    const patch = resize.updateResize(-60, 25)

    const waypoints = (patch as any).waypoints as [number, number][]
    expect(waypoints).toHaveLength(4)
    expect(waypoints[0]).toEqual([0, 50])       // unchanged (prev waypoint)
    expect(waypoints[1]).toEqual([140, 50])     // bend1: leave prev horizontally
    expect(waypoints[2]).toEqual([140, 75])     // Cnew: dragged corner position
    expect(waypoints[3]).toEqual([200, 75])     // bend2: exit next vertically
    expect((patch as any).routeMode).toBe('manual')
    assertAxisAligned(fullRoute(patch!, arrow))
  })

  it('waypoint drag (FR-3 regression): dragging a corner never produces a diagonal segment', () => {
    // Repro case: points=[[0,0],[200,100]], waypoints=[[0,50],[200,50]],
    // drag waypoint index 1 by (-60,25) — the old code left [140,50]→[200,100] diagonal.
    const arrow = makeArrow({
      points: [[0, 0], [200, 100]],
      waypoints: [[0, 50], [200, 50]],
      routeMode: 'manual',
    })
    const resize = makeResize([arrow])

    resize.beginWaypointDrag('arrow-1', 'waypoint', 1, 0, 0)
    const patch = resize.updateResize(-60, 25)

    const route = fullRoute(patch!, arrow)
    // Must be fully axis-aligned — no diagonal segments anywhere.
    assertAxisAligned(route)
    // Corner moved toward the pointer: some point's x should be less than 200 (original).
    const xs = route.map(([x]) => x)
    expect(xs.some(x => x < 200)).toBe(true)
  })

  it('segment slide is capped at the 50-waypoint schema limit (no oversized save)', () => {
    // 49 existing waypoints: a slide would add 2 → 51 > 50 cap, so it must be blocked.
    const many: [number, number][] = Array.from({ length: 49 }, (_, i) => [i, 0])
    const arrow = makeArrow({ points: [[0, 0], [200, 0]], waypoints: many, routeMode: 'manual' })
    const resize = makeResize([arrow])

    resize.beginWaypointDrag('arrow-1', 'segment', 0, 0, 0)
    const patch = resize.updateResize(10, 30)

    // Blocked: waypoints unchanged (still 49), never grows past the cap.
    expect((patch as any).waypoints).toHaveLength(49)
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

    // The element should be updated — segment slide produces two waypoints
    const mid = store.elements.find((e: DiagramElement) => e.id === 'arrow-1')!
    expect((mid as any).routeMode).toBe('manual')
    expect((mid as any).waypoints).toHaveLength(2)

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
