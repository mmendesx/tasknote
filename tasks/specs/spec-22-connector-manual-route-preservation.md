# Spec: Connector manual-route preservation

## Overview
Today a user cannot durably hand-route a connector: any shape move or endpoint
reposition reverts a manual connector to the clean auto route (the spec-21 FR-4
interim). This is because generated connector "legs" and user-drawn "bends" live
in the same `waypoints` array, indistinguishable — so re-anchor logic can't keep
the user's bends while regenerating the legs. This spec stores **user bends
separately from generated legs**, so a manual route persists across shape moves
and endpoint repositions: the user's bends stay fixed at their canvas positions
and only the connecting leg to each (possibly moved) endpoint is regenerated,
orthogonally and clearance-aware.

## Actors
- **User** hand-routing a connector: drags segment/bend handles, then moves the
  bound shapes or repositions endpoints and expects the route to hold.
- **Re-anchor / reposition logic** (shape move, nudge, endpoint resize, load):
  regenerates only legs, preserves user bends.
- **Render / export**: draw the full route `[start, ...renderedBends, end]`.

## Functional requirements

### FR-1: User bends are stored distinctly from generated legs
A connector's user-drawn bends are persisted in a dedicated, user-owned
representation, separate from any auto-generated leg corners. The rendered route
is composed at write time as: the start leg (endpoint → first user bend), the
user bends in order, the end leg (last user bend → endpoint). With no user bends,
the route is the pure auto route (spec-21 behavior).

### FR-2: Manual bends survive a shape move (bends fixed, legs reconnect)
Moving (or nudging) a shape bound to a manual connector keeps every user bend at
its **absolute canvas position** and re-anchors the bound endpoint to the shape's
new facing side. Only the **leg** between the moved endpoint and the nearest user
bend is regenerated, as an axis-aligned path (≤1 added corner) leaving the
endpoint perpendicular to its (clearance-chosen) side. The connector stays
`routeMode: 'manual'`. The route remains all right angles. No leg corners
accumulate across repeated moves (idempotent: N moves produce the same structure
as one).

### FR-3: Manual bends survive an endpoint reposition
Repositioning a connector endpoint (dragging its handle onto a shape or to empty
space) keeps the user bends and regenerates only the adjacent leg, same rules as
FR-2. (Dragging an endpoint to empty space: the leg becomes the direct segment
from the free endpoint to the first user bend, kept axis-aligned where the bend
allows; a free endpoint has no side.) Stays manual.

### FR-4: A user bend engulfed by a moved shape is kept
If, after a move, a user bend lies inside a shape's bounding box, it is **kept**
at its position and the route still passes through it (it may visually run under
the shape). Bends are never silently dropped. The user can drag the bend out or
reset the connector.

### FR-5: Legs are clearance-aware and axis-aligned
A regenerated leg uses the same side selection as auto routing
(`chooseConnectorSides` / `anchorForSide`, spec-21 follow-up) so the endpoint
exits the roomier side, and connects to the nearest user bend with axis-aligned
segments (≤1 corner). Every consecutive pair of points in the full route shares x
or y (the `assertAxisAligned` invariant from the spec-21 bug fixes).

### FR-6: Drag interactions set/extend user bends
Dragging a segment-midpoint handle inserts a user bend at that position; dragging
a bend handle moves that user bend. Both flip the connector to `routeMode:
'manual'` and write the user-bend representation (not the rendered legs). One undo
entry per drag. (Re-uses spec-21's axis-aligned segment-slide; the difference is
WHERE it writes — into user bends.)

### FR-7: Reset clears user bends
Double-clicking a connector clears its user bends and returns it to `auto`
(spec-21 FR-5 behavior, now clearing the user-bend representation).

### FR-8: One undo entry for move + reroute
A shape move that also reroutes a manual connector is a single undo step (the
reroute rides in the move's history entry, as auto re-anchor already does). Undo
restores both the shape position and the prior route.

### FR-9: Backward compatibility
Existing scenes (spec-20 with no waypoints; spec-21 with `waypoints` +
`routeMode`) load and render unchanged. A spec-21 `manual` connector's existing
`waypoints` are migrated into the new user-bend representation on load (treated as
user bends), so previously hand-routed connectors keep their shape. Auto
connectors are unaffected.

## Technical requirements

### Architecture
The root cause is one array (`waypoints`) holding two kinds of points. Separate
them:
- **User bends** — a distinct, persisted, user-owned list. The only thing drag
  interactions write and the only thing re-anchor/reposition preserve.
- **Generated legs** — never persisted as user data; computed at write time from
  the endpoint + its clearance-chosen side + the nearest user bend.

The rendered/exported route is always derived as `[start, ...legStart,
...userBends, ...legEnd, end]` collapsed (dedup + no collinear redundancy) so it
stays minimal and orthogonal. Re-anchor (`reanchorBoundConnectorsInPlace`),
reset (`resetConnectorRoute`), endpoint resize (`commitResize`), and load
(`computeAutoRoute` / normalization) all go through ONE shared route-composition
function so draw/move/reset/resize/load never diverge (the recurring spec-21
failure mode). Compose with the just-shipped clearance side selection.

### Data model
`packages/shared/src/dtos.ts`, line/arrow connector schema. Decision required
(see Open questions — leaning option A):
- **Option A (preferred): repurpose `waypoints` as USER bends only; derive legs
  at render-from-stored.** Keep `waypoints` as the persisted user bends (rename in
  intent, not in wire format), and store the FULL rendered route in `points`? No —
  `points` must stay the 2 endpoints (spec-20/21 invariant). Instead: `waypoints`
  holds ONLY user bends; the rendered route (with legs) is recomputed by render
  from `points[0]`, `waypoints` (user bends), `points[1]` + each end's side. But
  render must stay shape-free (spec-21 constraint) → the legs must be precomputed
  and stored too.
  This tension forces a **two-field model**:
  - `waypoints` (existing) = the FULL rendered route's interior points (legs +
    bends), exactly as today — what render/export draw, shape-free.
  - NEW `userBends?: [number,number][]` = the user-owned bends only. Re-anchor
    preserves `userBends`, regenerates legs, and rewrites `waypoints` =
    compose(start, legs, userBends, end). `routeMode: 'manual'` when `userBends`
    is non-empty.
- `userBends` is additive + optional (backward compatible). Max bound (≤ 50)
  mirrors the `waypoints` cap.
- No DB migration: `scene_json` is opaque JSON; additive optional field.

### API contracts
No endpoint changes. Additive optional `userBends` on the connector schema;
existing payloads stay valid (additive per API conventions).

### UI structure
- `orthogonalRoute.ts` — add `composeManualRoute(startAnchor, startSide,
  userBends, endAnchor, endSide)` returning the full interior route (legs +
  bends, collapsed). Reuse `anchorForSide`, `chooseConnectorSides`, the
  collinear/dedup collapse.
- `stores/diagrams.ts` — `reanchorBoundConnectorsInPlace` + `computeAutoRoute`:
  for manual connectors, preserve `userBends`, recompute sides via clearance,
  rebuild `waypoints` via `composeManualRoute`; keep `routeMode: 'manual'`. Load
  normalization migrates spec-21 manual `waypoints` → `userBends` once.
  `resetConnectorRoute` clears `userBends`.
- `useResize.ts` — `buildWaypointPatch` writes `userBends` (insert/move a user
  bend) and recomposes `waypoints`; `commitResize` endpoint reposition preserves
  `userBends`, regenerates legs, recomposes (replaces the current revert-to-auto).
- `useCanvasPointer.ts` draw-commit — unchanged (new connectors have no user
  bends → auto).
- `DiagramElementView.vue` / `exportDiagram.ts` — unchanged: still render
  `[points[0], ...waypoints, points[1]]` (waypoints already the full route).
- `DiagramSelectionHandles.vue` — bend handles render from `userBends` (the
  user-owned points), segment handles from the rendered route; unchanged
  endpoint handles.

### Infrastructure
None.

## Non-functional requirements
- **Correctness invariant**: after ANY move/nudge/resize/reset/load, the full
  rendered route is axis-aligned and free of accumulated/collinear stray corners
  (the property three spec-21 bugs violated). This is the primary acceptance gate.
- **Idempotency**: repeated re-anchors (per-frame drag) must not grow the route.
- **Performance**: route composition O(bends) per connector; re-anchor remains an
  O(n) connector scan. No per-frame shape lookups beyond existing.
- **Compatibility**: spec-20 and spec-21 scenes load and render unchanged (auto);
  spec-21 manual connectors keep their shape via the one-time `userBends`
  migration.

## Dependencies
- spec-21 connector routing v2 (waypoints, routeMode, segment-drag, render,
  export, load normalization) — available; this extends it.
- Clearance-based side selection (`chooseConnectorSides`, `anchorForSide` in
  `orthogonalRoute.ts`) — available (just shipped); legs compose with it.

## Constraints
- `points` stays the 2 endpoints (spec-20/21 invariant — handles, resize,
  anchoring depend on it).
- Render/export must NOT look up shapes — they draw the stored `waypoints` route;
  all leg computation happens at write time.
- All write paths (draw, move, nudge, resize, reset, load) compose the route
  through ONE shared function — no per-site divergence.
- Additive schema only — old scenes parse and render unchanged.
- Do NOT change the auto/clearance routing itself (out of scope; just shipped).

## Open questions
- **Two-field (`waypoints` + `userBends`) vs single-field with a marker** — the
  spec leans to the additive `userBends` field with `waypoints` remaining the
  full shape-free rendered route (keeps render unchanged + shape-free). An
  alternative (tag each waypoint as leg/bend) is more invasive to the wire format.
  *Default: two-field. Non-blocking.*
- **Engulfed-bend UX affordance** — bends kept (FR-4); whether to visually hint a
  bend is hidden under a shape is a later polish. *Non-blocking.*

## Glossary
- **User bend** — an interior route point the user explicitly placed (drag).
  Persisted in `userBends`; preserved across moves.
- **Leg** — the generated orthogonal connection between an endpoint and the
  nearest user bend (or the other endpoint when there are no bends). Never
  persisted as user data; recomputed at write time.
- **Rendered route** — `[start, ...waypoints, end]`, where `waypoints` =
  compose(legs + userBends); what render/export draw, shape-free.
- **Clearance side** — the exit side chosen by `chooseConnectorSides` (roomier
  edge-to-edge axis), shipped in the prior follow-up.
