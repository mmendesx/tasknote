# PRD: Orthogonal / elbow connector routing

**Spec**: tasks/specs/spec-20-orthogonal-connector-routing.md

## Summary
Diagram connectors (line/arrow) render as orthogonal elbow paths — axis-aligned
segments with 90° bends, leaving each shape on the side facing the other — instead
of straight diagonals. The elbow is **derived** from the two stored endpoints by a
pure `orthogonalRoute` function (render/export/hit-test expand it; nothing extra is
persisted). The only shape-aware change to stored data is placing bound endpoints
at the facing-side midpoint inside the existing single recompute hook. No schema
change, no parallel re-anchor mechanism.

## Behavior scenarios

### Feature: Orthogonal route geometry (pure)

#### Scenario: Horizontally separated shapes route left/right with right angles
  Given endpoints start=(100,50) on shape A's right side and end=(300,90) on shape B's left side
  When orthogonalRoute computes the path
  Then every segment is horizontal or vertical
  And every bend is 90°
  And the path begins heading right from A and ends heading right into B

#### Scenario: Vertically separated shapes route top/bottom
  Given A centered at (100,100) and B centered at (120,400) (|dy| > |dx|)
  When the route is computed
  Then the connector leaves A's bottom and enters B's top
  And all segments are axis-aligned

#### Scenario: Aligned shapes produce a straight axial segment (0 bends)
  Given A and B share the same center y and are separated only in x
  When the route is computed
  Then the path is a single straight horizontal segment (no bends)

#### Scenario: Offset shapes produce at most two bends
  Given A's facing side and B's facing side are offset on the cross axis
  When the route is computed
  Then the path has at most 2 interior bends

#### Scenario: Degenerate/overlapping shapes do not crash
  Given two overlapping shapes (or a zero-size shape)
  When the route is computed
  Then a short direct path is returned and no error is thrown

### Feature: Bound endpoints anchor to the facing side

#### Scenario: A bound endpoint sits on the facing-side midpoint
  Given an arrow bound to rectangle R, with the other end to R's right
  When connectors recompute (R is in the moved set)
  Then R's endpoint sits at the midpoint of R's right edge (offset out by the gap)
  And the stored points array still has exactly 2 entries

#### Scenario: Manual endpoint editing re-anchors to the facing side
  Given a connector whose endpoint the user drags onto shape R
  When the endpoint binds to R on release
  Then the stored endpoint snaps to R's facing-side midpoint
  And the connector renders orthogonally

### Feature: Re-route on move/nudge (single hook)

#### Scenario: Moving a bound shape re-routes its connector orthogonally
  Given an arrow bound A→B rendered as an elbow
  When the user drags A to a new position
  Then the connector re-routes orthogonally to A's new facing side
  And it remains all right angles
  And the move + re-route is one undo entry

#### Scenario: Keyboard nudge re-routes orthogonally
  Given a bound arrow and its source shape selected
  When the user nudges the shape with an arrow key
  Then the connector re-routes orthogonally in the same history entry

### Feature: One end free / fully free

#### Scenario: One bound end, one free end routes orthogonally
  Given an arrow with startBinding to A and a free end point
  When the route is computed
  Then it leaves A on the side facing the free point and reaches it with axis-aligned segments

#### Scenario: A fully unbound line stays direct
  Given a hand-drawn line with no startBinding and no endBinding
  When it renders
  Then it is a direct 2-point segment (no forced elbow)

### Feature: Render / export / hit-test

#### Scenario: An elbow connector renders as a polyline
  Given a bound arrow that routes with two bends
  When the canvas renders
  Then the arrow is drawn as a polyline through all derived points
  And the arrowhead points along the final segment

#### Scenario: The whole elbow path is selectable
  Given a bound arrow rendered as an elbow
  When the user clicks anywhere along any segment of the path
  Then the connector is selected

#### Scenario: Selection handles stay at the two endpoints
  Given a bound arrow rendered as an elbow with two bends
  When it is selected
  Then exactly two endpoint handles are shown (at the stored endpoints, not at bends)

#### Scenario: Export reproduces the elbow path
  Given a bound arrow that routes with bends
  When the diagram is exported to SVG
  Then the exported SVG contains a polyline through the same derived points with the arrowhead on the final segment

### Feature: Drawing

#### Scenario: Drawing an arrow between two shapes yields an orthogonal route
  Given the arrow tool
  When the user draws from inside shape A to inside shape B
  Then the committed connector renders as an orthogonal elbow (not a straight diagonal)

## Tasks

> **Architecture decision (locked): anchor at write-time, derive bends from the 2
> stored points.** Facing-side anchoring is applied wherever a connector's
> endpoints are *written* (draw, move-hook, resize) via ONE shared
> `facingSideAnchor` helper, so the stored `points` are always the two visible
> attach points. Render/export/hit-test then derive the elbow from those **two
> stored points alone** (dominant-axis rule) — `orthogonalRoute` takes NO shape
> args and the presentational component does NO shape lookup. This avoids computing
> the anchor twice (the bug-1 "two mechanisms" trap) and keeps selection
> handles/resize on the visible endpoints.

### ICT-1: Pure `orthogonalRoute` geometry module (2 points → elbow)
- **What**: New `orthogonalRoute(start, end)` returning an ordered point list (≥2)
  from just the two endpoints: dominant axis of `end - start` chooses H-first vs
  V-first (FR-2); emit a straight axial segment when aligned (0 bends), else ≤2
  bends through a mid-coordinate (FR-3). Pure, O(1), no shape args, no search.
  Also export `facingSideAnchor(shape, toward)` — the single helper that returns a
  shape's facing-side midpoint (offset by the perimeter `gap`) toward a point;
  reuse `elementCenter`, `rectEdgePoint`/`ellipseEdgePoint`, `gap`. (ICT-2/7 call
  `facingSideAnchor` at write time; render calls `orthogonalRoute` on the result.)
- **Where**: `apps/web/src/features/diagrams/orthogonalRoute.ts` (new) +
  `__tests__/orthogonalRoute.spec.ts`
- **Validated by**: Horizontally separated shapes route left/right with right angles; Vertically separated shapes route top/bottom; Aligned shapes produce a straight axial segment (0 bends); Offset shapes produce at most two bends; Degenerate/overlapping shapes do not crash; A bound endpoint sits on the facing-side midpoint (facingSideAnchor unit)
- **Estimate**: M

### ICT-2: Anchor bound endpoints at the facing side in every write path
- **What**: Apply `facingSideAnchor` wherever stored connector endpoints are
  written for a *bound* end, so a connector is correctly anchored without needing a
  move first:
  (a) `reanchorBoundConnectorsInPlace` (`stores/diagrams.ts`) — replace the
  ray-to-center `boundEndpoint(shape, otherCenter)` with `facingSideAnchor(shape,
  towardOtherEnd)`; still write `points: [start, end]` (exactly 2 stored points);
  keep the free-end branch reading `points[1]`/`points[0]` as the far end; keep the
  self-loop fallback (no crash).
  (b) the draw-commit bind path `resolveArrowEndpoints` (`useCanvasPointer.ts`) and
  (c) the endpoint-drag bind path `commitResize` (`useResize.ts`) — when an end
  binds to a shape, anchor it via the same helper. This is the single place
  anchoring logic lives; render never recomputes it.
- **Where**: `apps/web/src/stores/diagrams.ts`,
  `apps/web/src/features/diagrams/useCanvasPointer.ts`,
  `apps/web/src/features/diagrams/useResize.ts`
- **Validated by**: A bound endpoint sits on the facing-side midpoint; Moving a bound shape re-routes its connector orthogonally; Keyboard nudge re-routes orthogonally; One bound end, one free end routes orthogonally; Drawing an arrow between two shapes yields an orthogonal route; Manual endpoint editing re-anchors to the facing side
- **Estimate**: M

### ICT-3: Render connectors as derived polylines (from 2 stored points)
- **What**: In `DiagramElementView.vue`, render `line`/`arrow` as
  `<polyline :points="route">` where `route = orthogonalRoute(points[0], points[1])`
  — **no shape lookup**, just the two stored endpoints — via `pointsToAttr` like
  `<pen>`. Keep `marker-end` for arrows (orients on the final segment). A fully
  unbound line still passes through `orthogonalRoute`, which returns a direct 2-point
  path when the endpoints don't warrant a bend (FR-5). Do NOT write the derived
  route back.
- **Where**: `apps/web/src/features/diagrams/DiagramElementView.vue`
- **Validated by**: An elbow connector renders as a polyline; A fully unbound line stays direct; An elbow connector renders as a polyline (draw render half)
- **Estimate**: S

### ICT-4: Hit-target covers the derived path
- **What**: Replace the transparent hit-target `<line>` with a transparent
  `<polyline>` over the same derived route (fill none, stroke transparent, wide
  stroke-width) so the connector is selectable anywhere along the elbow.
- **Where**: `apps/web/src/features/diagrams/DiagramElementView.vue`
- **Validated by**: The whole elbow path is selectable
- **Estimate**: S

### ICT-5: Export connectors as derived polylines
- **What**: In `exportDiagram.ts`, serialize `line`/`arrow` as `<polyline points="…">`
  over `orthogonalRoute(points[0], points[1])` (reuse `pointsToAttr`), keeping the
  existing per-color arrow `<marker>` on `marker-end`.
- **Where**: `apps/web/src/features/diagrams/exportDiagram.ts`
- **Validated by**: Export reproduces the elbow path
- **Estimate**: S

### ICT-6: Selection handles stay at the two endpoints (verify)
- **What**: Confirm `DiagramSelectionHandles.vue` still renders handles from
  `points[0]`/`points[1]` (stored endpoints), unaffected by derived bends. Add a
  test asserting exactly two handles for an elbow connector. Likely no code change —
  this is a guard that the derive approach didn't leak bends into handle rendering.
- **Where**: `apps/web/src/features/diagrams/DiagramSelectionHandles.vue` +
  `__tests__/DiagramSelectionHandles.spec.ts`
- **Validated by**: Selection handles stay at the two endpoints
- **Estimate**: S

> ICT-7 (draw-commit orthogonal route) was folded into ICT-2 — anchoring at the
> draw-bind path is now part of ICT-2's "every write path," and the elbow render is
> ICT-3. The end-to-end draw integration test lives with ICT-2.

## Open questions
- **Routing style when partially aligned** — default: dominant-axis side choice with
  ≤2 bends through a mid-coordinate. Confirm if a specific bend style is wanted;
  otherwise default stands. *Non-blocking.*
- **Manual waypoint dragging** — out of scope (auto routing only). If wanted later,
  that follow-up would justify widening the `points` schema. *Non-blocking.*

## Dependencies
- `connectorGeometry.ts` (`rectEdgePoint`, `ellipseEdgePoint`, `gap`),
  `elementCenter`, `boundEndpoint` — available; ICT-1 builds on them.
- The single recompute hook `reanchorBoundConnectorsInPlace` — available; ICT-2
  extends it (do not add a parallel mechanism).
- `<pen>` polyline render + `pointsToAttr` + per-color export markers — available as
  the pattern to follow.
- ICT-1 gates ICT-3/4/5/7 (they call `orthogonalRoute`); ICT-2 gates the move/draw
  anchoring scenarios. No backend/API/DTO change.
