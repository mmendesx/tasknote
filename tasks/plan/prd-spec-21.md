# PRD: Connector routing v2 — side-aware auto-route + manual waypoints

**Spec**: tasks/specs/spec-21-connector-routing-v2.md

## Summary
Connector elbows become side-aware (each end exits perpendicular to the edge its
anchor sits on, killing the stub-then-bend kink) and user-rearrangeable (drag
route handles to add waypoints). The foundation is one inversion of spec-20:
route bends are computed at **write time** (where each end's side is known via
`facingSideAnchor`) and **stored** in a new optional `waypoints` field, with a
`routeMode` flag deciding whether they refresh on re-anchor (`auto`) or persist
(`manual`). `points` stays the 2 endpoints, so spec-20 handles/resize/anchoring
are untouched. Render/export draw `[start, ...waypoints, end]` with no shape
lookup.

## Behavior scenarios

### Feature: Side-aware auto-route (write-time, stored)

#### Scenario: Left/right-anchored connector exits horizontally (no kink)
  Given A's anchor is on A's right side and B's anchor is on B's left side
  And the two shapes are offset more vertically than horizontally
  When the auto-route is computed
  Then the first segment leaves A's right anchor heading horizontally (not vertically)
  And the last segment enters B's left anchor heading horizontally
  And every segment is axis-aligned with ≤ 2 interior bends

#### Scenario: Top/bottom-anchored connector exits vertically
  Given A's anchor is on A's bottom side and B's anchor is on B's top side
  When the auto-route is computed
  Then the first segment leaves A's bottom anchor heading vertically
  And all segments are axis-aligned

#### Scenario: Aligned anchors produce a straight segment (0 bends)
  Given both anchors sit on the same exit axis with no cross offset
  When the auto-route is computed
  Then waypoints is empty and the route is a single straight segment

#### Scenario: Route is stored, not derived at render
  Given an auto-routed bound connector
  When the element is inspected after draw
  Then its waypoints field holds the interior bends
  And the rendered polyline equals [start, ...waypoints, end]

#### Scenario: Degenerate/overlapping shapes do not crash
  Given two overlapping shapes (or a zero-size shape)
  When the route is computed
  Then a short direct path is produced and no error is thrown

### Feature: Auto re-route on move/nudge

#### Scenario: Moving a bound shape refreshes the auto route
  Given an auto-routed arrow bound A→B
  When the user drags A to a new position
  Then both endpoints re-anchor to the new facing sides
  And waypoints are recomputed side-aware
  And the move + re-route is one undo entry

#### Scenario: Keyboard nudge refreshes the auto route
  Given an auto arrow and its source shape selected
  When the user nudges the shape with an arrow key
  Then the connector re-routes side-aware in the same history entry

### Feature: Manual waypoint drag

#### Scenario: Dragging a segment handle adds a waypoint and goes manual
  Given a selected auto connector with two visible segment handles
  When the user drags a segment handle to a new position
  Then a waypoint is inserted at that position
  And the connector re-routes through it with axis-aligned segments
  And its routeMode becomes 'manual'
  And the drag is one undo entry

#### Scenario: Dragging an existing waypoint moves it
  Given a selected manual connector with one waypoint
  When the user drags that waypoint handle
  Then the waypoint moves and the route follows
  And routeMode stays 'manual'

#### Scenario: Endpoint handles are unchanged by waypoints
  Given a manual connector with two waypoints
  When it is selected
  Then exactly two endpoint handles render at the stored endpoints
  And waypoint handles render at each waypoint, visually distinct from endpoints

### Feature: Manual route survives a shape move

#### Scenario: Moving a shape keeps manual waypoints, re-anchors the end
  Given a manual arrow bound A→B with user waypoints
  When the user drags B to a new position
  Then B's endpoint re-anchors to B's new facing side
  And the user's interior waypoints are unchanged
  And routeMode stays 'manual'

#### Scenario: Re-anchored manual connector stays orthogonal at the moved end
  Given a manual arrow bound A→B with one interior waypoint
  When the user drags B so its endpoint moves off the waypoint's axis
  Then the segment between B's new endpoint and the nearest waypoint is re-routed axis-aligned
  And the route remains all right angles
  And the interior waypoint position is unchanged

#### Scenario: Nudging a shape keeps manual waypoints
  Given a manual bound arrow and its bound shape selected
  When the user nudges the shape
  Then the endpoint re-anchors but the waypoints persist

### Feature: Reset to auto

#### Scenario: Double-clicking a connector resets it to auto
  Given a manual connector with waypoints
  When the user double-clicks the connector
  Then its waypoints are cleared
  And routeMode becomes 'auto'
  And it immediately re-routes side-aware

#### Scenario: Double-clicking a shape still edits its label (no regression)
  Given a rectangle with a label
  When the user double-clicks the rectangle
  Then the label editor opens (connector reset does not intercept shape dblclick)

### Feature: Unbound connectors and export

#### Scenario: A fully unbound auto line stays direct
  Given a hand-drawn line with no bindings and routeMode auto
  When it renders
  Then it is a direct 2-point segment (waypoints empty)

#### Scenario: An unbound connector can still take manual waypoints
  Given a hand-drawn arrow with no bindings
  When the user drags a segment handle
  Then a waypoint is added and routeMode becomes 'manual'

#### Scenario: Export reproduces auto and manual routes
  Given one auto connector with bends and one manual connector with waypoints
  When the diagram is exported to SVG
  Then each is a polyline through [start, ...waypoints, end] with the arrowhead on the final segment

#### Scenario: Old scene without waypoints/routeMode renders unchanged
  Given a persisted scene whose connectors have no waypoints or routeMode
  When the diagram loads
  Then each connector renders identically to a freshly auto-routed connector
  And no validation error is thrown

## Tasks

> **Architecture decision (locked): compute the route at write time, store it,
> render from stored points.** This inverts spec-20's "derive at render" only
> for the bends — `points` stays the 2 endpoints (handles/resize/anchoring
> unchanged). `waypoints` + `routeMode` are additive optional fields. `auto`
> refreshes waypoints on every re-anchor; `manual` preserves them. Render/export
> read `[start, ...waypoints, end]` and never look up shapes.

### ICT-1: Additive schema — `waypoints` + `routeMode`
- **What**: Add `waypoints?: [number,number][]` (max ~50) and
  `routeMode?: z.enum(['auto','manual'])` to the line and arrow schemas. Both
  optional → old scenes parse unchanged. Update the inferred `DiagramElement`
  type consumers as needed.
- **Where**: `packages/shared/src/dtos.ts`
- **Validated by**: Old scene without waypoints/routeMode renders unchanged; Route is stored, not derived at render
- **Estimate**: S

### ICT-2: Side-aware `orthogonalRoute` + `autoWaypoints` helper
- **What**: Extend `orthogonalRoute` to take each end's **exit side/direction**
  and emit a perpendicular-exit elbow (left/right side → horizontal first;
  top/bottom → vertical first; aligned → 0 bends). Add `autoWaypoints(startAnchor,
  startSide, endAnchor, endSide)` returning the **interior** bends only (the array
  to store in `waypoints`). Have `facingSideAnchor` also return (or expose) the
  chosen side so write sites can pass it in. Pure, O(1), no shape args beyond the
  precomputed sides. Degenerate inputs return a short/empty path (no throw).
- **Where**: `apps/web/src/features/diagrams/orthogonalRoute.ts` +
  `__tests__/orthogonalRoute.spec.ts`
- **Validated by**: Left/right-anchored connector exits horizontally (no kink); Top/bottom-anchored connector exits vertically; Aligned anchors produce a straight segment (0 bends); Degenerate/overlapping shapes do not crash
- **Estimate**: M

### ICT-3: Write side-aware auto `waypoints` in every write path
- **What**: At each site that writes a bound connector's endpoints, also compute
  and store the auto `waypoints` (via `autoWaypoints` using the sides from
  `facingSideAnchor`) when `routeMode` is auto/absent:
  (a) `reanchorBoundConnectorsInPlace` (`stores/diagrams.ts`) — after re-anchoring
  endpoints, recompute `waypoints` for `auto`; for `manual`, keep the interior
  waypoints and **regenerate only the endpoint↔adjacent-waypoint connecting leg**
  so the route stays orthogonal after the end moves (FR-4).
  (b) draw-commit `resolveArrowEndpoints` (`useCanvasPointer.ts`) — new auto
  connectors store their bends.
  (c) endpoint-drag `commitResize` (`useResize.ts`) — re-anchoring an end refreshes
  auto bends.
- **Where**: `apps/web/src/stores/diagrams.ts`,
  `apps/web/src/features/diagrams/useCanvasPointer.ts`,
  `apps/web/src/features/diagrams/useResize.ts`
- **Validated by**: Moving a bound shape refreshes the auto route; Keyboard nudge refreshes the auto route; Moving a shape keeps manual waypoints, re-anchors the end; Re-anchored manual connector stays orthogonal at the moved end; Nudging a shape keeps manual waypoints
- **Estimate**: M

### ICT-4: Render connectors from stored route
- **What**: In `DiagramElementView.vue`, render `line`/`arrow` as a polyline over
  `[points[0], ...(waypoints ?? []), points[1]]` — **no `orthogonalRoute` call at
  render, no shape lookup**. Keep `marker-end` on arrows (orients on the final
  segment). The transparent hit-target polyline covers the same path. Unbound auto
  with empty waypoints → direct 2-point line (FR-6).
- **Where**: `apps/web/src/features/diagrams/DiagramElementView.vue`
- **Validated by**: Route is stored, not derived at render; A fully unbound auto line stays direct; Endpoint handles are unchanged by waypoints
- **Estimate**: S

### ICT-5: Export connectors from stored route
- **What**: In `exportDiagram.ts`, serialize `line`/`arrow` as a `<polyline>` over
  `[start, ...waypoints, end]` (reuse `pointsToAttr`), per-color arrow `<marker>`
  on `marker-end`. Drop the render-time `orthogonalRoute` call.
- **Where**: `apps/web/src/features/diagrams/exportDiagram.ts`
- **Validated by**: Export reproduces auto and manual routes
- **Estimate**: S

### ICT-6: Waypoint drag handles + manual mode
- **What**: In `DiagramSelectionHandles.vue`, render draggable **segment-midpoint**
  handles for the selected connector (visually distinct from the two endpoint
  handles). A drag inserts/moves a waypoint and flips `routeMode` to `'manual'`,
  re-routing through the waypoint with axis-aligned segments; one undo entry per
  drag. Implement the drag in a new `useConnectorWaypointDrag` or by extending
  `useResize`. Endpoint handles stay exactly at `points[0]`/`points[1]`.
- **Where**: `apps/web/src/features/diagrams/DiagramSelectionHandles.vue` (+ a
  waypoint-drag composable) + `__tests__/DiagramSelectionHandles.spec.ts`
- **Validated by**: Dragging a segment handle adds a waypoint and goes manual; Dragging an existing waypoint moves it; Endpoint handles are unchanged by waypoints; An unbound connector can still take manual waypoints
- **Estimate**: L

### ICT-7: Double-click a connector resets to auto
- **What**: In `DiagramCanvas.vue` `onCanvasDblClick`, when the hit element is a
  `line`/`arrow`, clear its `waypoints`, set `routeMode='auto'`, and recompute the
  auto route (one history entry). Shape double-click still opens the label editor
  (guard by element type — connectors have no label path).
- **Where**: `apps/web/src/features/diagrams/DiagramCanvas.vue` +
  `__tests__/DiagramShapeLabelEdit.spec.ts` (or a connector-reset spec)
- **Validated by**: Double-clicking a connector resets it to auto; Double-clicking a shape still edits its label (no regression)
- **Estimate**: S

### ICT-8: Load-time normalization for legacy scenes (backward compat)
- **What**: On `loadDiagram` (`stores/diagrams.ts`), normalize every `auto`
  connector that loaded **without** `waypoints`: compute its side-aware
  `waypoints` from its bound shapes (present in the just-loaded scene) using the
  ICT-2 route fn — the same computation as the move/draw write paths. This is the
  ONLY place render-time backward compatibility can be satisfied (render is
  forbidden from looking up shapes), so a spec-20 scene renders its elbow, not a
  straight diagonal. Manual connectors and connectors already carrying `waypoints`
  are left untouched. Also verify `waypoints`/`routeMode` survive a save→load
  round-trip (they ride in `scene_json`).
- **Where**: `apps/web/src/stores/diagrams.ts` (`loadDiagram`) +
  `apps/web/src/stores/__tests__/diagrams.spec.ts`
- **Validated by**: Old scene without waypoints/routeMode renders unchanged; Moving a shape keeps manual waypoints, re-anchors the end
- **Estimate**: M
- **Depends on**: ICT-2 (route fn), ICT-1 (schema)

## Open questions
- **Waypoint handle style** — segment-midpoint "+" handles vs draggable existing
  bends. Default: segment-midpoint handles that materialize a waypoint on drag.
  *Non-blocking.*
- **Auto `waypoints` persistence** — store derived auto bends (uniform render) vs
  leave empty and fall back to 2-point at render. Default: store them so render is
  always `[start, ...waypoints, end]`. *Non-blocking.*
- **Multi-waypoint manual routing** — v2 supports adding/moving waypoints; cleanup
  (merging colinear bends, deleting a waypoint) is minimal/none. Add later if
  needed. *Non-blocking.*

## Dependencies
- spec-20 (`orthogonalRoute`, `facingSideAnchor`,
  `reanchorBoundConnectorsInPlace`, polyline render/export, selection handles) —
  available; ICT-2/3/4/5/6 extend them.
- Recent bugfixes (deferred pointer capture; bbox binding) — available; ICT-6/7
  build on the corrected pointer + binding behavior.
- ICT-1 gates ICT-2…8 (schema). ICT-2 gates ICT-3/4/5/8 (route fn). ICT-3 gates the
  move scenarios. ICT-6 gates manual-drag scenarios. ICT-8 (load normalizer) gates
  the legacy-scene compatibility scenario and must ship with the render change
  (ICT-4) or old scenes render straight diagonals. No backend/API/DTO endpoint
  change — additive schema only.
