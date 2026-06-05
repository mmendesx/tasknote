# Spec: Diagram Connectors (binding arrows)

## Overview
Extend the diagram canvas (spec-11) so an arrow can **bind** its endpoints to shapes
(rectangle/ellipse) in the same diagram. A bound endpoint follows its shape: when the
shape moves, the connector re-routes automatically; the link is what lets a user "point
one thing at another" and have it stay connected. Binding was an explicit Phase-1
non-goal in spec-11; this spec adds it.

> Scope note: the user raised two other items alongside this. The dark-mode text-input
> invisibility was a bug, already fixed this session (wrong CSS token → `--color-text-primary`).
> "Move element" was reproduced as working for normal click+drag. Neither is specified here;
> this spec covers connectors only.

## Actors
- **User** — draws an arrow from one shape to another; drags shapes and watches connectors follow.
- **Diagram canvas / store** — recomputes bound connector geometry on move and persists it.

## Functional requirements

### FR-1: Bind an arrow endpoint by drawing onto a shape
When the Arrow tool is active, if the draw **starts** over a shape's hit-target, the new
arrow's `startBinding` is set to that shape's id; if it **ends** over a shape's hit-target,
`endBinding` is set to that shape's id. An endpoint released on empty canvas stays **free**
(its binding is `null`) — bound and free endpoints coexist on the same arrow.

### FR-2: Bound endpoints anchor to the shape center
A bound endpoint's point is the **center** of its bound shape's bounding box
(`x + width/2`, `y + height/2`). At creation, each bound endpoint is computed to that center;
a free endpoint keeps the pointer position where it was drawn.

### FR-3: Moving a shape re-routes its bound connectors
When a shape is moved (drag), every arrow with a `startBinding`/`endBinding` referencing that
shape has the corresponding endpoint recomputed to the shape's new center **live during the
drag**, and the recomputed `points` are persisted by the existing debounced autosave. A
connector bound at both ends to two moved shapes updates both endpoints.

### FR-4: Self-consistency on creation
Drawing an arrow whose start and end land on the **same** shape is allowed (both bindings →
that shape); it renders as a degenerate/short connector. (No special loop routing — non-goal.)

### FR-5: Deleting a bound shape detaches its connectors in place
When a shape is deleted, any connector bound to it has that binding cleared to `null` and the
arrow **remains** at its last computed `points` (it becomes a free arrow). Connectors are
**not** auto-deleted with the shape.

### FR-6: Connectors render as normal arrows
A bound arrow renders identically to a free arrow — same arrowhead marker, same `currentColor`
stroke, same selection/hit-target behavior. No new visual treatment.

### FR-7: Persistence round-trips bindings
`startBinding`/`endBinding` are stored inside `scene_json` and survive save/reload. Reopening a
diagram restores connectors still bound to their shapes (moving a shape after reload re-routes).

## Technical requirements

### Architecture
Pure frontend + shared-schema change. `scene_json` is an opaque JSON blob persisted as a TEXT
column — **no backend/DB migration**; the binding fields live inside the scene and are validated
by the shared zod schema (`ZodValidationPipe` already guards writes). The connector-recompute
logic hooks into the existing move path.

### Data model
Extend the **line/arrow** variants of `DiagramElementSchema` in `packages/shared/src/dtos.ts`
with two **optional** fields (additive — old elements without them stay valid):

```
startBinding: z.object({ elementId: z.string() }).nullable().optional()
endBinding:   z.object({ elementId: z.string() }).nullable().optional()
```

Add a `DiagramBinding` type export. Only `arrow` is required to support binding in this phase;
applying the same optional fields to `line` is acceptable and keeps the two variants symmetric,
but line-binding UI is a non-goal (see below) — the fields may simply go unused for lines.

No changes to `DiagramSceneSchema`, the entity, the controller, or any endpoint.

### API contracts
None changed. Existing `PATCH /diagrams/:id` carries the updated `scene_json` (now possibly
containing bindings) and validates it against the extended schema.

### UI structure
Files touched (all under `apps/web/src/features/diagrams/` unless noted):

- **`useDrawTools.ts`** — `buildLinearElement` (arrow path) gains optional `startBinding`/`endBinding`
  params (or a follow-up assignment) so the commit can record which shapes the endpoints landed on.
- **`DiagramCanvas.vue`** — arrow draw handlers (`handleDrawPointerDown` / `onCanvasPointerUp`)
  resolve the shape under the start and end points via the existing hit-test
  (`closest('[data-element-id]')`) and pass the resulting bindings into the arrow build. A small
  helper resolves a scene point → containing shape id (reuse `hitElementId`, or hit-test the
  shape bbox).
- **`useSelection.ts` / store** — the move recompute. The cleanest hook is the **store**
  (`apps/web/src/stores/diagrams.ts`): when `updateElement` changes a shape's geometry (move),
  after applying the patch, iterate elements and for every arrow bound to the moved shape,
  recompute the bound endpoint(s) to the shape's new center (via `computeElementBbox` → center)
  and update that arrow's `points`. A `recomputeBoundConnectors(movedElementId)` helper. Deletion
  (`removeElement`) similarly clears bindings that referenced the removed id (FR-5).
- **`DiagramElementView.vue`** — no change required (a bound arrow is still an `arrow` element;
  its `points` already carry the resolved geometry).
- A center helper: `elementCenter(el)` returning `{ x, y }` (reuse `computeElementBbox`).

### Infrastructure
None.

## Non-functional requirements

### Performance
- Move recompute is O(connectors) per drag frame. For workflow-diagram scale (≤ ~200 elements,
  few dozen connectors) this is negligible; no indexing/structure needed. Recompute only arrows
  bound to the specific moved shape, not all arrows.

### Accessibility / Compatibility
- No new interactive controls (binding is implicit in drawing), so no new ARIA surface.
- Connectors must look and select identically to existing arrows in both light and dark themes
  (inherits the `currentColor` stroke already in place).

## Dependencies
- spec-11 diagram canvas (elements, move path, hit-test, autosave). **available**
- `@tasknote/shared` `DiagramElementSchema` (extended here). **available**
- `computeElementBbox` in `useSelection.ts` (reused for centers). **available**

## Constraints
- **No backend/DB migration** — bindings live in `scene_json`; the schema change is additive and
  must not break existing diagrams (old arrows have no binding fields → still valid).
- Do not change connector rendering vs existing arrows.
- Bound-shape move must reuse the existing move/`updateElement`/autosave path — do not introduce a
  parallel persistence route.
- Binding references are **within a single diagram** (element ids are scene-local).

## Phase-1 non-goals (explicit — do NOT implement)
- Edge-intersection / perimeter routing — endpoints anchor to shape **center** only.
- Orthogonal / elbow / curved routing.
- Multi-point / waypoint connectors (still exactly two endpoints).
- Labels/text on connectors.
- Binding for `line`, `pen`, or `text` endpoints, or binding an arrow to another arrow/line.
- Re-binding UI (dragging an existing arrow's endpoint onto a new shape to re-attach) — bindings
  are set at draw time only in this phase.
- Cross-diagram links (an element pointing to a different diagram).
- Auto-layout / auto-routing around obstacles.

## Glossary
- **Connector** — an `arrow` element with at least one bound endpoint.
- **Binding** — `{ elementId }` on an arrow endpoint referencing the shape it follows; `null`/absent = free endpoint.
- **Anchor (center anchor)** — the bound endpoint's resolved point: the center of the bound shape's bounding box.
