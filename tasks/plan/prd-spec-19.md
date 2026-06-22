# PRD: Diagram connector re-anchoring on move + shape labels

**Spec**: tasks/specs/spec-19-diagram-connector-reanchor-and-labels.md

## Summary
Two diagram-editor enhancements. (1) Connectors bound to a node re-anchor to the
node's shape perimeter live while the node is dragged or keyboard-nudged, instead
of going stale until the arrow endpoint is manually dragged. (2) Rectangle and
ellipse shapes gain an optional inline label, edited by double-click, reusing the
existing text-edit machinery and persist path. No new shape types; no new API
endpoint.

## Behavior scenarios

### Feature: Connector re-anchoring on move

#### Scenario: Dragging a bound node moves its connector endpoint
  Given an arrow whose endBinding references rectangle "R"
  And the arrow's end sits on R's left edge
  When the user drags R 100px to the right
  Then the arrow's end endpoint stays on R's perimeter, facing the arrow's start
  And the arrow's start endpoint is unchanged

#### Scenario: Connector follows the node during the drag, not only on drop
  Given an arrow bound to ellipse "E"
  When the user drags E by a known delta (one pointermove, before releasing)
  Then the arrow's bound endpoint is recomputed on that pointermove
  And the endpoint equals boundEndpoint(E-at-new-position, other-end), not E's old anchor
  And the connector visibly tracks E throughout the drag

#### Scenario: Both endpoints re-anchor when both bound shapes move together
  Given an arrow with startBinding "A" and endBinding "B"
  And both A and B are selected
  When the user drags the selection
  Then both the start and end endpoints re-anchor to A and B respectively

#### Scenario: A connector bound to an unmoved shape is untouched
  Given an arrow with startBinding "A" (selected) and endBinding "B" (not selected)
  When the user drags only A
  Then the start endpoint re-anchors to A
  And the end endpoint (on B) is unchanged

#### Scenario: A connector with no bindings is untouched on move
  Given a free line with no startBinding or endBinding near shape "S"
  When the user drags S (the line is not selected)
  Then the line's points are unchanged

#### Scenario: Move + re-anchor is a single undo step
  Given an arrow bound to rectangle "R"
  When the user drags R and then presses undo once
  Then R returns to its original position
  And the arrow endpoint returns to its original anchored point

### Feature: Connector re-anchoring on keyboard nudge

#### Scenario: Nudging a bound node re-anchors its connector
  Given a rectangle "R" with a bound arrow, R selected
  When the user presses ArrowRight to nudge R
  Then R moves by the nudge step
  And the bound arrow endpoint re-anchors to R's new perimeter
  And the nudge + re-anchor form one undo entry

#### Scenario: Connector bound to a deleted shape does not crash on move
  Given an arrow whose endBinding referenced shape "X"
  And "X" was deleted (binding cleared to null)
  When the user moves another bound shape in the same scene
  Then no error occurs
  And the arrow with the null binding is left unchanged

### Feature: Shape labels

#### Scenario: A shape with no label renders nothing extra
  Given a rectangle with no label field
  When the canvas renders
  Then no label text element is drawn for it
  And the rectangle's size and position are unchanged

#### Scenario: Double-click opens the label editor pre-filled
  Given a rectangle "R" with label "Start" in select mode
  When the user double-clicks R
  Then an inline text input appears over R pre-filled with "Start"

#### Scenario: Enter commits the label
  Given the label editor open over ellipse "E" with input "Decision"
  When the user presses Enter
  Then E's label becomes "Decision"
  And the label renders centered within E
  And the change is one undo entry and is persisted

#### Scenario: Escape cancels the label edit
  Given ellipse "E" with label "Decision" and the editor open showing "DecisionX"
  When the user presses Escape
  Then E's label remains "Decision"

#### Scenario: Empty label clears without deleting the shape
  Given a rectangle "R" with label "Old" and the editor open
  When the user clears the input and presses Enter
  Then R's label is empty and no label text renders
  And R itself still exists on the canvas

#### Scenario: Whitespace-only label is treated as empty
  Given the label editor open over a rectangle with input "   "
  When the user presses Enter
  Then the rectangle's label is cleared (no label rendered)

#### Scenario: Text element double-click behavior is unchanged
  Given a type:'text' element "T"
  When the user double-clicks T and clears it and commits
  Then T is deleted (existing text-element behavior preserved)

#### Scenario: A labeled shape exports with its label
  Given a rectangle with label "Start"
  When the diagram is exported to SVG
  Then the exported SVG contains the centered "Start" text within the rectangle

#### Scenario: Single click still selects, does not edit
  Given a rectangle "R"
  When the user single-clicks R
  Then R is selected
  And no label input is shown

## Tasks

### ICT-1: Add optional `label` to rectangle/ellipse DTOs
- **What**: Add `label: z.string().optional()` to the `rectangle` and `ellipse`
  variants of `DiagramElementSchema`. Purely additive; confirm existing scenes
  (no `label`) still validate. Update any TS types/exports consumed by the web app.
- **Where**: `packages/shared/src/dtos.ts`
- **Validated by**: A shape with no label renders nothing extra; Enter commits the label
- **Estimate**: S

### ICT-2: Pure re-anchor helper for moved shapes
- **What**: Add `reanchorConnectorsForMovedShapes(elements, movedIdSet)` to
  `connectors.ts`, returning `{ id, patch }[]` for every `line`/`arrow` whose
  start/end binding references a moved shape. For each affected endpoint, recompute
  via `boundEndpoint(boundShape, from)` where `from` is the other endpoint's bound
  shape center (if bound) else its raw stored point — mirroring
  `resolveArrowEndpoints`. Skip null bindings and bindings to shapes not in the
  set. Pure, no DOM. Allocate only emitted patches.
  - **Post-move geometry**: the helper MUST anchor to each moved shape's *new*
    position, not its pre-move position. The caller has already applied the move
    delta to the shapes (ICT-3/4 build the moved-shape patches first); pass the
    helper an `elements` view that reflects the moved positions (apply patches to a
    shallow-cloned lookup, or pass the per-id moved bbox). Anchoring to stale
    positions causes a one-frame lag that a loose test would miss.
- **Where**: `apps/web/src/features/diagrams/connectors.ts`
- **Validated by**: Dragging a bound node moves its connector endpoint; Both endpoints re-anchor when both bound shapes move together; A connector bound to an unmoved shape is untouched; A connector with no bindings is untouched on move; Connector bound to a deleted shape does not crash on move
- **Estimate**: M

### ICT-3: Re-anchor on pointer move
- **What**: In `handleMovePointerMove`, after building move patches, call the
  ICT-2 helper with the moved id set **and the moved-shape geometry** (so it
  anchors to post-move positions), then append its connector patches to the same
  batched `store.updateElements` call (same gesture/history). Re-anchor must run
  each pointermove so the connector tracks live.
- **Where**: `apps/web/src/features/diagrams/useCanvasPointer.ts`
- **Validated by**: Connector follows the node during the drag, not only on drop; Move + re-anchor is a single undo step; Dragging a bound node moves its connector endpoint
- **Estimate**: S

### ICT-4: Re-anchor on keyboard nudge
- **What**: In the nudge path, after building nudge patches, call the ICT-2 helper
  with the nudged id set and fold connector patches into the same batched update /
  single history entry.
- **Where**: `apps/web/src/features/diagrams/useCanvasKeyboard.ts`
- **Validated by**: Nudging a bound node re-anchors its connector
- **Estimate**: S

### ICT-5: Render shape labels on canvas
- **What**: In `DiagramElementView.vue`, for `rectangle`/`ellipse` with a non-empty
  `label`, render a centered `<text>` (text-anchor middle, dominant-baseline
  central) at bbox center; single line, clipped/ellipsized to shape width, no shape
  resize; `pointer-events: none` so it doesn't block hit-testing. Nothing rendered
  when label absent/empty.
- **Where**: `apps/web/src/features/diagrams/DiagramElementView.vue`
- **Validated by**: A shape with no label renders nothing extra; Enter commits the label (render half); Empty label clears without deleting the shape
- **Estimate**: S

### ICT-6: Double-click to edit shape label
- **What**: Extend the dblclick dispatch in `DiagramCanvas.vue`: for
  `rectangle`/`ellipse`, open the existing inline text input pre-filled with
  `el.label`. Commit (Enter/blur) writes `label` via `store.updateElement` as one
  history entry through the existing debounced PATCH. Escape cancels. Empty/
  whitespace commit clears `label` but does NOT delete the shape. Leave the
  `type:'text'` path (empty deletes) untouched. Ensure single-click still selects
  and entering edit does not start a move.
  - **Editor reuse — three couplings to break**: the existing inline input is
    bound to `type:'text'` semantics in three ways; the dispatch needs a
    text-element-vs-shape-label mode covering all three:
    1. **Position** — text editor positions by element x/y/fontSize; a shape label
       positions at the shape's bbox center.
    2. **Target field** — text editor writes `.text`; shape-label mode writes `.label`.
    3. **Empty behavior** — text editor deletes on empty; shape-label mode clears
       `.label` and keeps the shape.
- **Where**: `apps/web/src/features/diagrams/DiagramCanvas.vue`
- **Validated by**: Double-click opens the label editor pre-filled; Enter commits the label; Escape cancels the label edit; Empty label clears without deleting the shape; Whitespace-only label is treated as empty; Text element double-click behavior is unchanged; Single click still selects, does not edit
- **Estimate**: M

### ICT-7: Include labels in SVG export
- **What**: In `exportDiagram.ts` `buildExportSvg`, emit the same centered `<text>`
  for labeled rectangle/ellipse so exported SVG matches the canvas.
- **Where**: `apps/web/src/features/diagrams/exportDiagram.ts`
- **Validated by**: A labeled shape exports with its label
- **Estimate**: S

## Open questions
- **New shape types ("etc.")** — Feature 1 is scoped as re-anchor-on-move for the
  shapes that exist today (rectangle, ellipse; "circle" = ellipse). The user wrote
  "rectangle, circle, **etc.**" — if "etc." means they also want *new* shape types
  (diamond, triangle, standalone circle), that is additional work (DTO variants +
  geometry edge-point fns + render + hit-test + export) and would add ICTs. Does
  not block the re-anchor work, which stands either way. **Confirm at handoff.**
- FR-1 confirmed as re-anchor-on-move (node move/nudge currently never recompute
  bound connectors — verified in `handleMovePointerMove` / `useCanvasKeyboard.ts`).

## Dependencies
- Existing connector geometry (`connectorGeometry.ts`, `connectors.ts`) — available.
- Existing inline text-edit machinery (`DiagramCanvas.vue` + text `foreignObject`
  input) — available.
- Shared DTO package `@tasknote/shared` — available; ICT-1 adds the additive field
  and must land before ICT-5/6/7 consume `label`.
