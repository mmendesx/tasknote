# Spec: Orthogonal / elbow connector routing

## Overview
Diagram connectors (line, arrow) currently draw as a single straight diagonal
segment between two shape-perimeter points. This spec replaces that with
**orthogonal (elbow) routing**: a connector leaves the source shape from the
side facing the target, travels in horizontal/vertical segments with right-angle
bends, and enters the target on its facing side — the flowchart look in the
reference screenshot. Routing is **automatic** (computed from the two shapes'
geometry); manual bend dragging is out of scope.

## Actors
- **Editor user** — draws connectors between shapes and moves shapes; expects the
  connector to re-route with clean right angles.

## Context (verified in code)
- Connector data model (`packages/shared/src/dtos.ts`): `line`/`arrow` store
  `points: z.tuple([[number,number],[number,number]])` — **exactly 2 points** —
  plus `stroke`, `strokeWidth`, `startBinding?`, `endBinding?` (`{ elementId }`).
- Render (`DiagramElementView.vue`): a single `<line x1 y1 x2 y2>` + a transparent
  hit-target `<line>`; arrow adds `marker-end="url(#diagram-arrowhead)"`. `<pen>`
  already renders a variable-length `<polyline>` — so polyline rendering exists in
  the codebase to follow.
- **Single geometry hook** (`stores/diagrams.ts` `reanchorBoundConnectorsInPlace`,
  line ~416): `arr[i] = { ...el, points: [start, end] }` — the sole place
  connector points are recomputed when a shape moves. Today it always writes a
  2-point straight line via `boundEndpoint(shape, otherCenter)`.
- Other point-writers (all assume 2 points): draw — `useDrawTools.buildLinearElement`,
  `useCanvasPointer.resolveArrowEndpoints`; endpoint drag — `useResize.buildEndpointPatch`,
  `commitResize`.
- Perimeter math (`connectorGeometry.ts`): `rectEdgePoint(rect, from, gap)`,
  `ellipseEdgePoint(ellipse, from, gap)` — ray-to-`from` perimeter intersection
  with an outward gap. `boundEndpoint(shape, from)` dispatches by shape type;
  `elementCenter(el)` gives bbox center. Only `rectangle`/`ellipse` are bindable.
- Export (`exportDiagram.ts`): line/arrow serialize to a `<line>` string;
  arrowheads via per-color `<marker>` defs.

## Functional requirements

### FR-1: A bound connector routes orthogonally between two shapes
Given a connector with both ends bound to shapes A and B, the rendered path
consists only of horizontal and vertical segments (every segment is axis-aligned;
every bend is 90°). It leaves A from the side facing B and enters B from the side
facing A.

### FR-2: Side selection follows relative position
The exit/entry sides are chosen from the shapes' relative geometry:
- If the shapes are primarily horizontally separated (|dx| ≥ |dy| using centers),
  the connector leaves/enters on left/right sides.
- If primarily vertically separated, it leaves/enters on top/bottom sides.
The endpoint sits on the **midpoint of the chosen side** (offset outward by the
existing perimeter `gap` so the arrowhead clears the shape).

### FR-3: Bend count adapts (≤ 2 bends)
- When the two facing sides are directly aligned (e.g. A's right edge band overlaps
  B's left edge band on the cross axis), the connector uses a single mid-line with
  two bends OR a straight axial segment when perfectly aligned (0 bends).
- Otherwise it uses a 2-bend "Z"/"S" route: out from the source side to a
  mid-coordinate, across, then into the target side — matching the reference
  screenshot's lower connector.
- No more than 2 interior bends are produced. Obstacle avoidance (routing around
  other shapes) is explicitly **out of scope**.

### FR-4: Routing recomputes when a bound shape moves or is nudged
Moving or keyboard-nudging a bound shape re-routes its connectors orthogonally,
reusing the existing single recompute hook (`reanchorBoundConnectorsInPlace`).
No second/parallel re-anchor mechanism is introduced. (This is the constraint that
the prior straight-line re-anchor regression taught — extend the canonical
function, don't add another.)

### FR-5: One end free, one end bound
If only one end is bound (other end is a free point), the connector still routes
orthogonally: it leaves the bound shape on the side facing the free point and
reaches the free point with axis-aligned segments (≤ 2 bends). A fully unbound
connector (both ends free, e.g. a hand-drawn line) keeps a direct 2-point path —
orthogonal routing applies only when at least one end is bound to a shape.

### FR-6: Arrowhead points along the final segment
For arrows, the arrowhead orients along the **last** segment entering the target
(so it points into the facing side), via the existing `marker-end` mechanism.

### FR-7: Connector renders and exports as the full derived path
- On-canvas render shows the full elbow path (all segments + bends), derived from
  the two stored endpoints via `orthogonalRoute`.
- The transparent hit-target covers the whole derived path (selectable anywhere
  along it).
- SVG export reproduces the same derived path with the arrowhead on the final
  segment.
- The element's stored `points` remains the 2 endpoints; the multi-point path
  exists only in the rendered/exported output.

### FR-8: Drawing a connector produces an orthogonal route
When the user draws an arrow/line from shape A to shape B, the committed connector
is already orthogonally routed (not a straight diagonal that only elbows later).

### FR-9: Manual endpoint editing preserves orthogonality where bound
Dragging a connector endpoint onto a shape (existing resize/bind behavior)
re-routes orthogonally for the bound end. Dragging an endpoint to empty space
falls back to FR-5 (bound-to-free) or a direct segment (free-to-free).

## Technical requirements

### Architecture — DERIVE the route, do NOT store it
The elbow path is a pure function of the connector's two endpoints (FR-2 picks
sides from their delta). **Stored `points` stays exactly 2 points `[start, end]`
(the true endpoints).** The multi-segment polyline is *derived on demand* at
render / export / hit-test by a shared function — never persisted. This was a
deliberate choice over widening the schema: a grep confirmed every reader of
connector `points` is visual (render, export, selection handles, hit-test) or
endpoint-editing (resize) — **nothing consumes stored points for a non-visual
purpose** — so persisting bends would be storing recomputable state (YAGNI), and
it would also break the free-end reader in the hook (`el.points[1]` would become a
bend, not the far end). Derive-at-render keeps `points[1]` meaning the far end.

**Decision (locked): anchor at write-time; derive bends from the 2 stored points.**
Facing-side anchoring is computed exactly once — wherever endpoints are *written* —
so the stored `points` are always the two visible attach points, and the elbow is
derived from those two points alone (no shape lookup at render). Computing the
anchor in both the store and the renderer would be two mechanisms for one job (the
trap that caused the prior re-anchor regression); this picks one.

- **New pure geometry module** `orthogonalRoute.ts` in `features/diagrams/`:
  - `orthogonalRoute(start, end)` → ordered point list `[[x,y], ...]` (≥ 2) from
    the two endpoints only: dominant axis of `end - start` picks H-first/V-first
    (FR-2); 0 bends when aligned, ≤ 2 bends otherwise (FR-3). Pure, O(1), no shape
    args, no search.
  - `facingSideAnchor(shape, toward)` → the shape's facing-side midpoint, offset by
    the perimeter `gap`, toward a point. Reuses `elementCenter`,
    `rectEdgePoint`/`ellipseEdgePoint`, `gap`. This is the ONE place anchoring math
    lives.
- **Write paths place the anchor** (not the renderer): for every *bound* endpoint,
  `reanchorBoundConnectorsInPlace` (move/nudge), `resolveArrowEndpoints` (draw bind)
  and `commitResize` (endpoint-drag bind) write the endpoint via
  `facingSideAnchor(shape, towardOtherEnd)`. Still `points: [start, end]` — two
  stored points in, two out. So a connector is correctly anchored on draw, not only
  after a move.
- **Render / export / hit-test** call `orthogonalRoute(points[0], points[1])` to
  expand the two stored endpoints into the displayed polyline. This expansion is the
  ONLY place multiple points exist; never written back.
- **Selection handles + resize** (`DiagramSelectionHandles`, `useResize`) keep
  operating on the 2 stored endpoints — handles show 2 endpoint handles on the
  visible attach points, not derived bends.

### Data model
- **No schema change.** `line`/`arrow` `points` stays the fixed 2-tuple
  `[[x1,y1],[x2,y2]]`. The route is derived, not stored, so no variable-length
  array and no migration. Existing scenes load unchanged.
- No new persisted fields. Bindings unchanged (`{ elementId }`); routing stays
  computed from geometry. (If manual waypoint dragging is ever wanted — explicitly
  out of scope here — *that* would justify widening `points`; until then, don't.)

### UI structure
- `DiagramElementView.vue`: render `line`/`arrow` as `<polyline :points="route">`
  where `route = orthogonalRoute(points[0], points[1], …)` — matching the existing
  `<pen>` polyline approach — instead of `<line>`; keep the arrowhead `marker-end`;
  the transparent hit-target becomes a matching `<polyline>` over the same derived
  route (fill none, stroke transparent, wide stroke-width).
- `DiagramSelectionHandles.vue`: unchanged — still renders handles at the 2 stored
  endpoints (`points[0]`, `points[1]`), not at derived bends.
- `DiagramCanvas.vue`: arrowhead marker unchanged.
- `exportDiagram.ts`: serialize `line`/`arrow` as `<polyline points="…">` over the
  derived route (reuse `pointsToAttr`), with the existing per-color arrow marker on
  `marker-end`.

### Edge cases
- Shapes overlapping or extremely close: degrade gracefully to a short direct
  segment (reuse the degenerate handling already in `rectEdgePoint`/`ellipseEdgePoint`).
- Perfectly aligned centers on one axis: 0-bend straight axial segment.
- Self-loop (both ends bound to the same shape): out of scope for fancy routing —
  keep the current fallback (center/short stub), do not crash.
- Ellipse endpoints: side-midpoint anchoring on an ellipse uses the ellipse's
  cardinal extreme (top/bottom/left/right point); reuse `ellipseEdgePoint` with a
  cardinal `from` direction.

## Non-functional requirements
- **Performance**: routing runs inside the existing per-move recompute (one O(n)
  connector scan). `orthogonalRoute` must be O(1) per connector (pure arithmetic,
  no search/pathfinding). Dragging stays smooth.
- **Undo/redo**: re-route is part of the existing move gesture's single history
  entry (unchanged — it already batches through `updateElements`).
- **Compatibility**: no schema change; old 2-point connectors load unchanged and
  simply render through the new derive path (a near-aligned pair yields few/no
  bends). Connectors with no binding stay direct (FR-5).
- **Accessibility**: no regression; connectors are presentational SVG.

## Dependencies
- Existing perimeter geometry (`connectorGeometry.ts`), `boundEndpoint`,
  `elementCenter`, and the store hook `reanchorBoundConnectorsInPlace` — available.
- `<pen>` polyline render + per-color export markers — available as the pattern to
  follow.
- Shared DTO package `@tasknote/shared` — needs the `points` widening.

## Constraints
- **Extend the single recompute hook** (`reanchorBoundConnectorsInPlace`); do NOT
  add a parallel re-anchor mechanism (this caused a regression previously).
- **No obstacle avoidance / no A\*** — pure relative-position routing, ≤ 2 bends.
- **No manual bend/waypoint dragging** in this spec (auto-routing only). Could be a
  future spec.
- No new runtime dependency. No new persisted fields beyond widening `points`.
- Do not change `startBinding`/`endBinding` shape (`{ elementId }` only).
- Keep the existing fully-free line/pen behavior (FR-5) — don't elbow hand-drawn
  unbound lines.

## Open questions
- **Routing style when partially aligned** — spec assumes the standard "exit facing
  side → mid-coordinate → enter facing side" (≤ 2 bends), choosing H-first vs
  V-first by the dominant axis. If a specific bend style is desired (e.g. always
  route through the midpoint of the gap, or always H-first), confirm; otherwise the
  dominant-axis default stands. *Non-blocking — default stated.*
- **Manual waypoint editing** — assumed out of scope (auto only). Confirm if you
  want draggable bends; that would be a follow-up spec. *Non-blocking.*

## Glossary
- **Orthogonal / elbow route** — a connector path made only of horizontal and
  vertical segments joined at 90° bends.
- **Facing side** — the side of a shape (top/bottom/left/right) that points toward
  the other endpoint, chosen by the shapes' relative center positions.
- **Recompute hook** — `reanchorBoundConnectorsInPlace` in `stores/diagrams.ts`,
  the one function that rewrites connector `points` when a bound shape moves.
