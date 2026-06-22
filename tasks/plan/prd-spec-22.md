# PRD: Connector manual-route preservation

**Spec**: tasks/specs/spec-22-connector-manual-route-preservation.md

## Summary
Let users hand-route a connector and have it persist across shape moves and
endpoint repositions. Root cause of the current revert-to-auto behavior: generated
legs and user bends share one `waypoints` array, indistinguishable. Fix: add an
additive `userBends` field holding ONLY the user's bends; `waypoints` remains the
full shape-free rendered route (legs + bends) that render/export already draw. All
write paths preserve `userBends`, recompute legs (clearance-aware), and recompose
`waypoints` through ONE shared function. Bends stay at absolute canvas positions;
only the leg to a moved endpoint regenerates; one undo entry; engulfed bends kept.

## Behavior scenarios

### Feature: User bends stored distinctly from legs

#### Scenario: Dragging a segment writes a user bend and composes the route
  Given a selected auto connector bound A→B
  When the user drags a segment handle to a point P
  Then the connector's userBends contains a bend near P
  And routeMode becomes 'manual'
  And the rendered route equals compose(start-leg, userBends, end-leg) and is axis-aligned

#### Scenario: A connector with no user bends renders the pure auto route
  Given a bound connector with empty userBends
  When it renders
  Then the route is the auto side-aware route (spec-21 behavior, no change)

### Feature: Manual bends survive a shape move

#### Scenario: Moving a bound shape keeps the user bend fixed and reconnects the leg
  Given a manual arrow bound A→B with one user bend at absolute (X,Y)
  When the user drags A to a new position
  Then the user bend is still at (X,Y)
  And only the leg from A's new endpoint to the bend is regenerated
  And the full route is axis-aligned
  And routeMode stays 'manual'

#### Scenario: Repeated moves do not accumulate leg corners (idempotent)
  Given a manual connector with one user bend
  When the bound shape is dragged across many pointer-move frames
  Then the number of route points after the drag equals the number after a single-step move
  And no collinear/stray corners accumulate
  And the route is axis-aligned

#### Scenario: Keyboard nudge preserves user bends
  Given a manual bound arrow and its bound shape selected
  When the user nudges the shape with an arrow key
  Then the user bends are unchanged and the leg re-anchors orthogonally in one history entry

### Feature: Manual bends survive an endpoint reposition

#### Scenario: Repositioning an endpoint onto a shape keeps user bends
  Given a manual connector with user bends, end bound to B
  When the user drags the start endpoint onto shape R
  Then the user bends are unchanged
  And the start leg from R's facing side to the first bend is regenerated axis-aligned
  And routeMode stays 'manual'

#### Scenario: Repositioning an endpoint to empty space keeps user bends
  Given a manual connector with user bends
  When the user drags an endpoint to empty canvas
  Then the user bends are unchanged
  And the endpoint connects to the nearest bend with an axis-aligned leg (free end, no side)
  And no stray/diagonal extra segments appear

### Feature: Engulfed bend

#### Scenario: A bend inside a moved shape is kept
  Given a manual connector with a user bend at (X,Y)
  When a shape is moved so its bbox now covers (X,Y)
  Then the bend remains in userBends at (X,Y)
  And the route still passes through it (no silent deletion)

### Feature: Reset

#### Scenario: Double-click clears user bends back to auto
  Given a manual connector with user bends
  When the user double-clicks the connector
  Then userBends is empty
  And routeMode is 'auto'
  And it renders the auto side-aware route

### Feature: Undo

#### Scenario: Move + reroute is one undo entry
  Given a manual arrow bound A→B with user bends
  When the user drags A and then undoes
  Then both A's position and the connector's prior route are restored in a single undo

### Feature: Backward compatibility

#### Scenario: spec-21 manual connector migrates its waypoints to user bends on load
  Given a persisted connector with routeMode 'manual' and waypoints but no userBends
  When the diagram loads
  Then its userBends is populated from the persisted waypoints
  And it renders the same shape it had before

#### Scenario: Auto and legacy scenes are unaffected
  Given a spec-20 scene (no waypoints) and a spec-21 auto scene
  When they load
  Then connectors render their auto side-aware routes unchanged (no userBends introduced for auto)

#### Scenario: Export reproduces a manual route with user bends
  Given a manual connector with user bends
  When the diagram is exported to SVG
  Then the polyline follows the full rendered route (legs + bends), arrowhead on the final segment

## Tasks

> **Architecture (locked):** add additive `userBends?: [number,number][]` =
> user-owned bends only. `waypoints` stays the full shape-free rendered route
> (legs + bends) that render/export already draw. ONE shared `composeManualRoute`
> builds `waypoints` from (startAnchor, startSide, userBends, endAnchor, endSide)
> using clearance sides + collinear/dedup collapse. Every write path (draw, move,
> nudge, resize, reset, load) preserves `userBends` and recomposes `waypoints`
> through it — no per-site divergence. Bends absolute; engulfed bends kept; move +
> reroute = one undo entry.

### ICT-1: Additive `userBends` schema
- **What**: Add `userBends: z.array(z.tuple([z.number(), z.number()])).max(50).optional()`
  to the line and arrow connector schemas. Additive/optional → old scenes parse
  unchanged. Update inferred-type consumers.
- **Where**: `packages/shared/src/dtos.ts` (+ `__tests__/dtos.spec.ts`)
- **Validated by**: spec-21 manual connector migrates its waypoints to user bends on load (schema half); Auto and legacy scenes are unaffected
- **Estimate**: S

### ICT-2: `composeManualRoute` — single route builder
- **What**: In `orthogonalRoute.ts`, add `composeManualRoute(start, startSide,
  userBends, end, endSide)` → the full interior route (`waypoints`): start leg
  (endpoint→first bend, ≤1 corner perpendicular to startSide), the userBends in
  order, end leg (last bend→endpoint), all run through dedup + collinear-collapse
  so it's minimal and axis-aligned. With empty userBends → the pure auto route
  (`autoWaypoints`). Handle a free end (no side) → direct axis-aligned leg where
  the bend allows. Pure, O(bends). Reuse `anchorForSide`, the collapse helpers.
- **Where**: `orthogonalRoute.ts` (+ `__tests__/orthogonalRoute.spec.ts`)
- **Validated by**: Dragging a segment writes a user bend and composes the route; Moving a bound shape keeps the user bend fixed and reconnects the leg; Repeated moves do not accumulate leg corners; A connector with no user bends renders the pure auto route
- **Estimate**: M

### ICT-3: Preserve `userBends` + recompose on shape move/nudge
- **What**: In `stores/diagrams.ts` `reanchorBoundConnectorsInPlace` and
  `computeAutoRoute`: a connector with non-empty `userBends` is manual — keep
  `userBends` verbatim, choose sides via `chooseConnectorSides`, anchor via
  `anchorForSide`, rebuild `waypoints` via `composeManualRoute`, keep
  `routeMode:'manual'`. Empty `userBends` → existing auto path. Replaces the
  revert-to-auto-on-move for connectors that have user bends. Engulfed bends are
  kept (no bbox filtering).
- **Where**: `stores/diagrams.ts`
- **Validated by**: Moving a bound shape keeps the user bend fixed and reconnects the leg; Repeated moves do not accumulate leg corners; Keyboard nudge preserves user bends; A bend inside a moved shape is kept; Move + reroute is one undo entry
- **Estimate**: M

### ICT-4: Drag writes `userBends` (segment + bend handles)
- **What**: In `useResize.ts` `buildWaypointPatch`: write the user bend into
  `userBends` (insert for a segment-slide at the right index; move for a bend
  drag), then set `waypoints = composeManualRoute(...)` and `routeMode:'manual'`.
  Bend handles in `DiagramSelectionHandles.vue` render from `userBends`; segment
  handles from the rendered `waypoints`. One undo entry per drag (unchanged
  gesture-history). Keep the axis-aligned guarantee + ≤50 cap (now on userBends).
- **Where**: `useResize.ts`, `DiagramSelectionHandles.vue`
  (+ `__tests__/DiagramWaypointDrag.spec.ts`, `DiagramSelectionHandles.spec.ts`)
- **Validated by**: Dragging a segment writes a user bend and composes the route; (bend-move) Repositioning scenarios rely on userBends being present
- **Estimate**: L

### ICT-5: Endpoint reposition preserves `userBends`
- **What**: In `useResize.ts` `commitResize` endpoint branch: replace the current
  revert-to-auto with: keep `userBends`, recompute the dragged end's anchor+side
  (clearance when both bound; toward-bend when free), rebuild `waypoints` via
  `composeManualRoute`, keep `routeMode:'manual'`. Empty userBends → stays auto
  (current behavior).
- **Where**: `useResize.ts` (+ `__tests__/DiagramResize.spec.ts`)
- **Validated by**: Repositioning an endpoint onto a shape keeps user bends; Repositioning an endpoint to empty space keeps user bends
- **Estimate**: M

### ICT-6: Reset clears `userBends`
- **What**: `resetConnectorRoute` (`stores/diagrams.ts`) clears `userBends` (in
  addition to recomputing the auto route + `routeMode:'auto'`). Double-click path
  unchanged otherwise.
- **Where**: `stores/diagrams.ts` (+ store test)
- **Validated by**: Double-click clears user bends back to auto
- **Estimate**: S

### ICT-7: Load migration + export
- **What**: In load normalization (`stores/diagrams.ts`): a persisted `manual`
  connector with `waypoints` but no `userBends` gets `userBends` seeded from its
  `waypoints` (treat the persisted route's interior as user bends), then
  recompose `waypoints` for consistency. Auto connectors untouched. Confirm export
  (`exportDiagram.ts`) needs no change (it draws `waypoints`). Add a store/load
  test for migration + an export test for a manual route.
- **Where**: `stores/diagrams.ts` (+ `__tests__/diagrams.spec.ts`,
  `exportDiagram.spec.ts`)
- **Validated by**: spec-21 manual connector migrates its waypoints to user bends on load; Auto and legacy scenes are unaffected; Export reproduces a manual route with user bends
- **Estimate**: M

## Open questions
- **Migration fidelity** — seeding `userBends` from a spec-21 manual connector's
  full `waypoints` treats former leg corners as user bends (they become fixed
  points). Acceptable: the route looks identical on load; subsequent moves keep
  those points. *Non-blocking.*
- **Engulfed-bend visual hint** — out of scope for v1 (bend kept, may run under a
  shape). *Non-blocking.*

## Dependencies
- spec-21 (waypoints/routeMode, segment-drag, render/export, load normalization) —
  available; this extends it.
- Clearance side selection (`chooseConnectorSides`, `anchorForSide`) — available;
  legs compose with it.
- ICT-1 gates all (schema). ICT-2 gates ICT-3/4/5/7 (the shared composer). ICT-3
  gates the move scenarios; ICT-4 gates drag-writes-userBends; ICT-5 the
  reposition scenarios. No backend/API/DTO endpoint change — additive schema only.
