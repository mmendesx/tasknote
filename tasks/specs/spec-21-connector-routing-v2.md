# Spec: Connector routing v2 — side-aware auto-route + manual waypoints

## Overview
Diagram connectors (line/arrow) currently render an orthogonal elbow derived at
render time from just the two stored endpoints (spec-20). Because the bend axis
is chosen from the anchor-to-anchor delta while the anchor *side* is chosen from
the shape centers, the two can disagree: a connector anchored on a shape's left/
right edge can exit vertically, producing an ugly "stub then bend" kink. This
spec makes the auto-route **side-aware** (each end leaves perpendicular to the
edge its anchor sits on) and adds **manual waypoint dragging** so users can
rearrange a route by hand. Both are built on one foundation: the route's interior
bends are computed at *write time* (where the shapes/sides are known) and stored,
so render stays shape-free.

## Actors
- **User** drawing/editing a diagram: draws connectors, drags shapes, drags route
  bends, double-clicks a connector to reset its route.
- **Render / export**: draw the stored route as a polyline; no shape lookup.

## Functional requirements

### FR-1: Side-aware auto-route (perpendicular exit)
An auto-routed connector leaves each bound end **perpendicular to the edge its
anchor sits on**: a left/right-side anchor exits horizontally, a top/bottom-side
anchor exits vertically. The kink in the reported screenshot (right-side anchor
exiting vertically) no longer occurs. The path remains all right angles with the
minimum bends needed (0 when the two anchors align on the exit axis, otherwise
≤2 interior bends).

### FR-2: Route is computed at write time and stored
The interior bend points of an auto-route are computed wherever a connector's
endpoints/anchors are written (draw-commit, shape move/nudge re-anchor, endpoint
resize) — the same single place that already runs `facingSideAnchor` and knows
each end's side — and stored on the element. Render and export draw
`[start, ...bends, end]` as a polyline with **no shape lookup** and no axis
re-derivation.

### FR-3: Manual waypoint drag
When a connector is selected, draggable handles appear on its route segments
(midpoints) and/or existing bends. Dragging a handle adds/moves a waypoint,
re-routing the connector through it with axis-aligned segments. The connector
switches to **manual** mode on first drag. The drag is one undo entry.

### FR-4: Manual route reverts to auto on a shape move
Moving (or nudging) a shape bound to a manual connector **re-anchors the bound
endpoints** to the shape's new facing side and **re-routes the connector to a
clean side-aware auto path** (`routeMode → 'auto'`). Hand-drawn bends are NOT
preserved across a shape move.

> **Why (revised):** the original FR-4 (preserve interior waypoints, regenerate
> only the connecting leg) shipped a defect — generated leg corners are stored in
> `waypoints` indistinguishably from user bends, so a per-frame re-anchor piled up
> stray collinear corners and, on a second move, produced disconnected/diagonal
> segments ("a lot of lines without connection"). Preserving bends correctly
> requires storing user bends separately from generated legs (a data-model change),
> tracked as a **spec-21 follow-up**. Until then, reverting to a clean auto route on
> move keeps every connector orthogonal and bounded.

### FR-4b: Backward compatibility via load-time normalization
A persisted scene from spec-20 stored bound connectors with **no** `waypoints`
(spec-20 derived the elbow at render). On load, every `auto` connector lacking
`waypoints` has them **computed once** from its (now-present) bound shapes — the
same side-aware computation used at draw/move — so it renders as the elbow it
showed before, not a straight diagonal. Load is treated as a write path. Manual
connectors and connectors that already carry waypoints are left as-is.

### FR-5: Reset to auto
Double-clicking a connector clears its waypoints and returns it to **auto** mode;
it immediately re-routes side-aware. (Double-click on a *shape* still edits its
label — FR unaffected; connectors have no label edit.)

### FR-6: Unbound connectors unchanged
A fully unbound (freehand) line/arrow stays a direct 2-point segment in auto
mode (spec-20 behavior preserved). It can still be given manual waypoints.

### FR-7: Selection handles
Endpoint handles remain exactly at the two stored endpoints (spec-20). Waypoint/
segment handles are visually distinct from endpoint handles and only appear for
the selected connector.

### FR-8: Export reproduces the route
SVG export serializes the same `[start, ...bends, end]` polyline (auto or manual),
arrowhead on the final segment.

## Technical requirements

### Architecture
Move route computation from **render-time derivation** (spec-20:
`orthogonalRoute(points[0], points[1])` in `DiagramElementView`/`exportDiagram`)
to **write-time computation + storage**. Render/export read the stored route.
This is the single behavioral inversion of spec-20's "derive at render" decision,
made because side-aware routing needs per-end side info that only exists at write
time. The "no shape lookup at render" constraint is *kept* — render reads stored
points only.

`orthogonalRoute` gains side awareness: it takes the two endpoints **plus each
end's exit side** (or exit direction) and emits a perpendicular-exit elbow. The
side is produced by `facingSideAnchor` (which already determines it) and passed
in at every write site — render never computes it.

### Data model
`packages/shared/src/dtos.ts` — line and arrow element schemas gain two optional
fields (additive, backward compatible — old scenes parse unchanged):

```
points: [[ax,ay],[bx,by]]            // UNCHANGED — the 2 endpoints (spec-20 invariant)
waypoints?: [number, number][]       // NEW — interior bend points, in order start→end
routeMode?: 'auto' | 'manual'        // NEW — 'auto' (default/absent) recomputes bends
                                     //       on re-anchor; 'manual' preserves waypoints
```

- `points[0]`/`points[1]` stay the two endpoints — selection handles, resize, and
  anchoring are **untouched** (no change to spec-20 invariants).
- For `routeMode: 'auto'` (or absent), `waypoints` holds the *derived* side-aware
  bends, refreshed on every re-anchor. For `'manual'`, `waypoints` holds the
  user's bends and is preserved across re-anchor.
- Full rendered route = `[points[0], ...waypoints, points[1]]`.
- Max waypoints bounded (e.g. ≤ 50) to mirror existing scene/element caps.

No DB migration: `scene_json` is opaque JSON; new optional fields are additive.

### API contracts
No endpoint changes. `DiagramScene` validation widens via the additive optional
fields above; existing payloads remain valid (additive change per API conventions).

### UI structure
- `orthogonalRoute.ts` — side-aware route function + helper to compute the auto
  `waypoints` from two anchors and their sides.
- `stores/diagrams.ts` `reanchorBoundConnectorsInPlace` — after re-anchoring
  endpoints: if `routeMode==='auto'`, recompute `waypoints`; if `'manual'`, keep
  interior waypoints and regenerate only the endpoint↔adjacent-waypoint leg
  (FR-4).
- `stores/diagrams.ts` `loadDiagram` — normalize: compute auto `waypoints` for
  any auto connector that loaded without them (FR-4b), using the bound shapes
  present in the loaded scene.
- `useCanvasPointer.ts` draw-commit + `useResize.ts` endpoint drag — write
  side-aware `waypoints` alongside the anchored endpoints.
- `DiagramElementView.vue` / `exportDiagram.ts` — render/export
  `[start, ...waypoints, end]` polyline; drop render-time `orthogonalRoute` call.
- `DiagramSelectionHandles.vue` — add waypoint/segment-midpoint drag handles
  (distinct from endpoint handles); a new `useConnectorWaypointDrag` (or extend
  `useResize`) applies the drag and flips `routeMode` to `'manual'`.
- `DiagramCanvas.vue` `onCanvasDblClick` — when the double-clicked element is a
  connector, reset it to auto (clear waypoints, `routeMode='auto'`, re-route).

### Infrastructure
None.

## Non-functional requirements
- **Accessibility**: waypoint handles keyboard-reachable is out of scope for v2
  (pointer-only), consistent with existing endpoint-drag (also pointer-only).
- **Performance**: route computation stays O(1) per connector; re-anchor remains
  an O(n) scan. No per-frame shape lookups added.
- **Compatibility**: old scenes (no `waypoints`/`routeMode`) render identically
  to a freshly auto-routed connector — achieved by load-time normalization
  (FR-4b), not by render-time fallback (render cannot look up shapes).

## Dependencies
- spec-20 elbow connectors (`orthogonalRoute`, `facingSideAnchor`,
  `reanchorBoundConnectorsInPlace`, polyline render/export) — **available**;
  this spec extends them.
- Recent bugfixes (deferred pointer capture; bbox binding) — available.

## Constraints
- **Do not change** `points` from a 2-tuple — selection handles, resize, and
  anchoring depend on `points[0]`/`points[1]` being the endpoints.
- Render/export must **not** look up shapes — they read stored points only.
- Manual waypoints must survive shape moves (no snap-back to auto on move).
- Additive schema only — old scenes must parse and render unchanged.

## Open questions
- **Waypoint handle style** — segment-midpoint "+" handles (Excalidraw-style) vs
  draggable existing bends. Default: segment-midpoint handles that materialize a
  waypoint on drag. *Non-blocking; default stands.*
- **Auto `waypoints` persistence** — auto bends could be stored (uniform render)
  or left empty with render falling back to a 2-point line when absent. Default:
  store auto bends so render is always `[start, ...waypoints, end]`. *Non-blocking.*

## Glossary
- **Anchor / endpoint** — `points[0]`/`points[1]`, the two attach points (on a
  bound shape's facing-side midpoint, offset by the perimeter gap).
- **Waypoint / bend** — an interior route point between the two endpoints.
- **Side / exit direction** — which edge (left/right/top/bottom) an anchor sits
  on; the route must leave it perpendicular to that edge.
- **routeMode** — `auto` (bends derived, refreshed on re-anchor) vs `manual`
  (bends user-owned, preserved on re-anchor).
