# PRD: Diagram Review Remediation

**Spec**: tasks/specs/spec-14-diagram-review-remediation.md

## Summary

Fix the 3 blocking and 8 non-blocking defects from the spec-13 review, close the 11 scenario-coverage and hygiene gaps, then decompose the oversized DiagramCanvas script. Blocking fixes land first, the refactor last; no API or schema changes.

## Behavior scenarios

### Feature: History integrity on selection (FR-A1)

#### Scenario: Click-select does not destroy redo
  Given a drawn rectangle that was just undone (redo stack non-empty)
  When the user plain-clicks another element without dragging
  Then redo still restores the rectangle

#### Scenario: Click without drag adds no history entry
  Given a scene with one committed mutation in history
  When the user clicks an element and releases without moving
  Then a single Ctrl+Z undoes that prior mutation (one press, visible change)

#### Scenario: Drag gesture is exactly one entry
  Given a selected rectangle
  When the user drags it 50 px and releases
  Then one undo press restores the original position

#### Scenario: Double-click text edit produces one entry
  Given a text element "draft"
  When the user double-click-edits it to "draft v2"
  Then one undo press restores "draft" (no junk entries from the clicks)

### Feature: Endpoint re-binding (FR-A2)

#### Scenario: Endpoint dropped on a rectangle binds to it
  Given an unbound arrow and a rectangle "target" at (100,100)-(200,180)
  When the arrow's head endpoint is dragged to scene point (150,140) and released
  Then endBinding equals { elementId: 'target' } and the head point lies on the rectangle's boundary

#### Scenario: Endpoint dropped on empty canvas stays unbound
  Given an arrow whose head was previously bound
  When the head endpoint is dragged to empty canvas and released
  Then endBinding is null and the point is exactly the drop location

#### Scenario: Topmost shape wins overlapping drop
  Given two overlapping rectangles where "top" renders after "bottom"
  When an endpoint is dropped inside the overlap
  Then the binding references "top"

#### Scenario: Geometric hit-test needs no DOM
  Given findShapeAtScenePoint called with a point inside an ellipse's perimeter
  Then it returns that ellipse's id without touching document.elementFromPoint

### Feature: Resize pointer capture (FR-A3)

#### Scenario: Release outside the canvas ends the resize
  Given a resize gesture in progress on a rectangle handle
  When pointerup fires outside the SVG (pointer was captured)
  Then resizeState is cleared and the rectangle keeps its last dragged size

#### Scenario: Next pointerdown starts fresh after interrupted resize
  Given a stale resize state (simulated interruption)
  When the user pointerdowns on empty canvas
  Then the stale state is reset and a marquee starts normally (no element warp)

### Feature: Save lifecycle (FR-B1)

#### Scenario: Save success cancels the pending retry
  Given a failed save with a retry scheduled in 2 s
  When a debounced save succeeds before the retry fires
  Then the retry timer is cancelled and no second PATCH is sent

#### Scenario: flushSave persists dirty state during a retry episode
  Given a failed save (debounce timer null, dirty true, retry pending)
  When the user switches diagrams (flushSave runs)
  Then a save attempt is made with the dirty elements before the switch

### Feature: Gesture cancellation restores geometry (FR-B2)

#### Scenario: pointercancel mid-move restores position
  Given a rectangle being dragged 30 px (patches already applied)
  When pointercancel fires
  Then the rectangle is back at its pre-gesture position and no save of moved geometry is scheduled

#### Scenario: pointercancel mid-resize restores size
  Given a rectangle mid-resize from 100×100 toward 150×150
  When pointercancel fires
  Then the rectangle is 100×100 again

### Feature: Both-bound re-anchoring (FR-B3)

#### Scenario: Moving one shape re-anchors both ends
  Given an arrow bound from rectangle A to rectangle B (both ends)
  When A moves 100 px right
  Then BOTH endpoints recompute: each lies on its shape's boundary along the new A-B center ray

### Feature: Degenerate geometry (FR-B4)

#### Scenario: Zero-size ellipse yields its center, not NaN
  Given an ellipse with width 0 loaded from a legacy scene with a bound arrow
  When the ellipse moves
  Then the connector endpoint equals the ellipse center and contains no NaN

### Feature: exportPng failure handling (FR-B5)

#### Scenario: Rasterization failure surfaces an error
  Given canvas.toBlob yields null (rasterization failure)
  When the user clicks Export PNG
  Then the promise rejects, an error toast is shown, and no .svg file is downloaded in its place

#### Scenario: Object URL revoked on failure
  Given a failing PNG export
  Then URL.revokeObjectURL is called for the created object URL

### Feature: Resize clamp canonical (FR-B6)

#### Scenario: Dragging past the opposite edge clamps at 8 px
  Given a 40×40 rectangle
  When the se handle is dragged 100 px past the nw corner
  Then the rectangle is 8×8 anchored at its fixed corner (no flip) — tests named accordingly

### Feature: Handle hit targets (FR-B7)

#### Scenario: Handle hit area is 12 screen px at any zoom
  Given zoom 0.5
  Then each handle's transparent hit element spans ≥ 24 scene px (12 screen px) while the visible handle stays 8 screen px

### Feature: Batch updates (FR-B8)

#### Scenario: Group move patches all elements in one store mutation
  Given 3 selected elements among 100
  When one pointermove of a group drag applies
  Then updateElements is called once with 3 patches and elements reference changes exactly once

#### Scenario: Nudge and applyStyle use the batch path
  Given 2 selected rectangles
  When ArrowRight is pressed / a stroke swatch is clicked
  Then a single batched mutation applies to both

### Feature: Coverage gaps (FR-C1)

#### Scenario: Toolbar shows the retrying label
  Given saveError is set
  Then the save indicator reads "Save failed — retrying"

#### Scenario: One toast per failure episode
  Given a save fails, a retry fails again, then a save succeeds, then a new save fails
  Then exactly two toasts were shown (one per episode)

#### Scenario: Ctrl+Z keydown undoes through the real handler
  Given a drawn rectangle and canvas focus (no text input)
  When a real keydown Ctrl+Z (and uppercase-Z variant Ctrl+Shift+Z) is dispatched
  Then the store undo/redo fires; while a text input is focused, it does not

#### Scenario: Handles hidden for multi-selection
  Given two selected rectangles
  Then no resize-handle elements are rendered; a single selected rect renders 8; a selected arrow renders endpoint handles; a pen stroke renders none

#### Scenario: Ctrl+wheel keeps the cursor's scene point fixed
  Given cursor over scene point P at zoom 1
  When ctrl+wheel zooms in
  Then screenToScene(cursor) still equals P

#### Scenario: Long pen stroke stores at most 200 points
  Given a simulated stroke of 600 raw pointermove samples
  When committed
  Then the stored pen element has ≤ 200 points; samples closer than 2 scene px were skipped during capture

#### Scenario: Styled elements persist their style through save
  Given a rectangle styled stroke #e03131
  When the debounced save fires
  Then the PATCH payload's element carries stroke "#e03131"

#### Scenario: New element adopts last-used style via the canvas path
  Given applyStyle set strokeWidth 4 earlier
  When the user draws a new line on the canvas (pointerdown→move→up)
  Then the committed line has strokeWidth 4

#### Scenario: Legacy center-anchored scene renders unchanged until next move
  Given a loaded scene with a bound arrow whose points sit at shape centers
  Then the rendered points are unchanged after load, and re-anchor only after the bound shape moves

### Feature: Hygiene + decomposition (FR-C2, FR-C3)

#### Scenario: Test suites pass without dead-field writes or global patches
  Given the cleaned spec files
  Then no test writes storeState.error, prototype patches are scoped with restore, and attached wrappers unmount

#### Scenario: Refactor preserves behavior
  Given the extracted composables
  Then all existing diagram tests pass unmodified (import paths excepted), DiagramCanvas.vue script < ~300 lines, extracted functions ≤ 40 lines

## Tasks

### ICT-1: Gesture-scoped history push (FR-A1)
- **What**: Stop pushing history on selection pointerdown. Move/resize gestures snapshot pre-gesture elements at pointerdown but push to history only when the gesture first changes geometry (or discard unchanged entry at pointerup). Cover dblclick-edit path.
- **Where**: apps/web/src/features/diagrams/DiagramCanvas.vue, useHistory.ts, stores/diagrams.ts, __tests__/
- **Validated by**: Click-select does not destroy redo; Click without drag adds no history entry; Drag gesture is exactly one entry; Double-click text edit produces one entry
- **Estimate**: M

### ICT-2: Geometric endpoint hit-test (FR-A2)
- **What**: `findShapeAtScenePoint(point, elements)` in connectors.ts (point-in-bbox / point-in-ellipse, topmost-first, bindable only). commitResize uses it with scene coords. Replace tautological newBindings test with identity assertions.
- **Where**: apps/web/src/features/diagrams/connectors.ts, useResize.ts, __tests__/DiagramResize.spec.ts, __tests__/connectors.spec.ts
- **Validated by**: Endpoint dropped on a rectangle binds to it; Endpoint dropped on empty canvas stays unbound; Topmost shape wins overlapping drop; Geometric hit-test needs no DOM
- **Estimate**: M

### ICT-3: Pointer capture for resize (FR-A3)
- **What**: Capture pointer when handle drag starts (emit handler path); delete dead `data-resize-handle` branch; defensive stale-state reset at pointerdown.
- **Where**: apps/web/src/features/diagrams/DiagramSelectionHandles.vue, DiagramCanvas.vue
- **Validated by**: Release outside the canvas ends the resize; Next pointerdown starts fresh after interrupted resize
- **Estimate**: S

### ICT-4: Save lifecycle hardening (FR-B1)
- **What**: cancelRetry() on save success; flushSave saves when dirty (not only when debounce pending).
- **Where**: apps/web/src/stores/diagrams.ts, stores/__tests__/diagrams.spec.ts
- **Validated by**: Save success cancels the pending retry; flushSave persists dirty state during a retry episode
- **Estimate**: S

### ICT-5: pointercancel restores originals (FR-B2)
- **What**: onCanvasPointerCancel restores elements from moveState.originalElements / resizeState.original before clearing state.
- **Where**: apps/web/src/features/diagrams/DiagramCanvas.vue, __tests__/
- **Validated by**: pointercancel mid-move restores position; pointercancel mid-resize restores size
- **Estimate**: S

### ICT-6: Both-bound re-anchor both ends (FR-B3)
- **What**: recomputeBoundConnectors recomputes BOTH endpoints when the connector is both-bound and either shape moves/resizes; fix the store test encoding single-end behavior.
- **Where**: apps/web/src/stores/diagrams.ts, stores/__tests__/diagrams.spec.ts
- **Validated by**: Moving one shape re-anchors both ends
- **Estimate**: S

### ICT-7: NaN guards in connector geometry (FR-B4)
- **What**: rectEdgePoint/ellipseEdgePoint return the center when results would be non-finite (zero-size shapes); unit tests for degenerate inputs.
- **Where**: apps/web/src/features/diagrams/connectorGeometry.ts, __tests__/connectorGeometry.spec.ts
- **Validated by**: Zero-size ellipse yields its center, not NaN
- **Estimate**: S

### ICT-8: exportPng loud failure (FR-B5)
- **What**: Narrow the catch, revoke object URLs on all paths, reject on failure; toolbar shows error toast on rejection. Tests for failure path and blob plumbing (mock canvas/Image).
- **Where**: apps/web/src/features/diagrams/exportDiagram.ts, DiagramToolbar.vue, __tests__/exportDiagram.spec.ts
- **Validated by**: Rasterization failure surfaces an error; Object URL revoked on failure
- **Estimate**: M

### ICT-9: Codify clamp behavior (FR-B6)
- **What**: Rename "flip"-named resize tests to clamp semantics; remove unreachable flip-normalization code in useResize if confirmed dead; comment records the spec amendment.
- **Where**: apps/web/src/features/diagrams/useResize.ts, __tests__/DiagramResize.spec.ts
- **Validated by**: Dragging past the opposite edge clamps at 8 px
- **Estimate**: S

### ICT-10: 12 px handle hit areas (FR-B7)
- **What**: Transparent zoom-compensated hit element (≥12 screen px) behind each 8 px visible handle; endpoint handles too.
- **Where**: apps/web/src/features/diagrams/DiagramSelectionHandles.vue, __tests__/
- **Validated by**: Handle hit area is 12 screen px at any zoom
- **Estimate**: S

### ICT-11: Batched updateElements (FR-B8)
- **What**: Store action applying k patches in one array copy + one connector-recompute pass; group move, nudge, applyStyle migrate to it.
- **Where**: apps/web/src/stores/diagrams.ts, DiagramCanvas.vue, stores/__tests__/diagrams.spec.ts
- **Validated by**: Group move patches all elements in one store mutation; Nudge and applyStyle use the batch path
- **Estimate**: M

### ICT-12: Coverage-gap tests (FR-C1)
- **What**: Add the nine missing behavior tests listed under Feature: Coverage gaps (retrying label, toast episodes, real Ctrl+Z keydown, handles visibility matrix, cursor-fixed ctrl+wheel, 600→≤200 pen points, style-in-save-payload, last-used style via canvas, legacy scene lazy re-anchor).
- **Where**: apps/web/src/features/diagrams/__tests__/, stores/__tests__/diagrams.spec.ts
- **Validated by**: All Feature: Coverage gaps scenarios
- **Estimate**: M

### ICT-13: Test hygiene (FR-C2)
- **What**: Remove dead storeState.error writes (3 specs); scope the setPointerCapture prototype patch with restore; unmount attached wrappers in afterEach.
- **Where**: apps/web/src/features/diagrams/__tests__/DiagramSelection.spec.ts, DiagramTools.spec.ts, DiagramConnectors.spec.ts (+ any attachTo offenders)
- **Validated by**: Test suites pass without dead-field writes or global patches
- **Estimate**: S

### ICT-14: Decompose DiagramCanvas.vue (FR-C3)
- **What**: Extract pointer state machine (useCanvasPointer.ts) and keyboard handling (useCanvasKeyboard.ts); script <~300 lines; long functions ≤40 lines (incl. applyStyle in store); rename useMarquee `active`→`isActive`; drop unused pointerleave param. Pure refactor — existing tests pass unmodified.
- **Where**: apps/web/src/features/diagrams/DiagramCanvas.vue, new useCanvasPointer.ts, new useCanvasKeyboard.ts, useMarquee.ts, stores/diagrams.ts
- **Validated by**: Refactor preserves behavior
- **Estimate**: L

## Open questions

None blocking. FR-B6 clamp decision flagged for human veto during review.

## Dependencies

- spec-13 implementation shipped (f21fb12..6bb6249); review findings 2026-06-10.
- Ordering: ICT-1..3 (blocking) → ICT-4..11 → ICT-12..13 → ICT-14 last (refactor moves settled code). ICT-2 before ICT-10 (both touch handles/resize); ICT-11 before ICT-12 (style-payload test asserts batched path).
