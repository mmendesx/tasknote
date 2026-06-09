# PRD: Diagram Tool Remediation + Professional Upgrade

**Spec**: tasks/specs/spec-13-diagram-pro-upgrade.md

## Summary

Fix the eight audit defects that make the diagram tool feel broken (Part A), then deliver the deferred professional features — undo/redo, resize, multi-select, style editing, edge-anchored connectors, text editing, shortcuts, export — to reach Excalidraw/Draw.io-class behavior (Part B). Native Vue 3 + SVG architecture is kept; all schema changes are additive.

## Behavior scenarios

### Feature: Save resilience (FR-A1)

#### Scenario: Failed autosave keeps the canvas editable
  Given an open diagram with 3 elements and the API returning 500 on PATCH
  When the debounced autosave fires and fails
  Then the SVG canvas remains mounted with all 3 elements visible
  And the save indicator shows "Save failed — retrying"
  And exactly one error toast is shown

#### Scenario: Save recovers after a transient failure
  Given a save has failed and the store is retrying with backoff
  When the API succeeds on a retry
  Then the save indicator returns to "Saved"
  And saveError is cleared

#### Scenario: Load failure still shows the error shell
  Given the API returns 404 for GET /diagrams/99
  When the user opens diagram 99
  Then the canvas area shows the load-error shell with the failure message

#### Scenario: List error does not leak into the editor
  Given the diagrams list failed to load earlier in the session
  When the user opens a diagram that loads successfully
  Then the canvas renders normally with no error shell

### Feature: Connector integrity (FR-A2)

#### Scenario: Dragging a bound arrow detaches it
  Given an arrow bound at both ends to rectangles "r1" and "r2"
  When the user drags the arrow body 50 px with the select tool
  Then the arrow's startBinding and endBinding are null
  And moving "r1" afterwards leaves the arrow exactly where it was dropped

### Feature: Wheel navigation (FR-A3)

#### Scenario: Plain wheel pans
  Given an open diagram at zoom 1
  When the user scrolls the wheel without modifiers
  Then the viewport scroll changes and zoom stays 1

#### Scenario: Ctrl+wheel zooms toward the cursor
  Given the cursor over a scene point P at zoom 1
  When the user scrolls with Ctrl (or Cmd) held
  Then zoom changes and P stays under the cursor

### Feature: Hit targets at zoom (FR-A4)

#### Scenario: Selecting a line at 10% zoom
  Given a diagram at zoom 0.1 containing one line
  When the user clicks within 6 screen px of the line
  Then the line becomes selected

### Feature: Centered toolbar zoom (FR-A5)

#### Scenario: Zoom-in keeps the viewport center fixed
  Given a shape at the exact center of the viewport at zoom 1
  When the user clicks the toolbar zoom-in button
  Then the shape remains at the viewport center at zoom 1.1

### Feature: Build health (FR-A6)

#### Scenario: Typecheck and build pass
  Given the apps/web workspace
  When "npm run typecheck" and "npm run build" execute
  Then both exit 0

### Feature: Bounded scenes (FR-A7)

#### Scenario: Oversized scene rejected by API
  Given a scene_json with 1,001 elements
  When PATCH /diagrams/:id is called with it
  Then the API responds 400 with a zod validation message

#### Scenario: Pen stroke is simplified on commit
  Given the user draws a 3-second freehand stroke producing > 500 raw samples
  When the stroke is committed
  Then the stored pen element has at most 200 points
  And its rendered shape is visually equivalent

#### Scenario: Scene at the cap is accepted
  Given a scene_json with exactly 1,000 elements
  When PATCH /diagrams/:id is called with it
  Then the API responds 200

### Feature: Gesture cancellation (FR-A8)

#### Scenario: pointercancel aborts an in-progress draw
  Given the user is mid-drag drawing a rectangle
  When a pointercancel event fires
  Then no element is committed and the preview disappears

### Feature: Undo / redo (FR-B1)

#### Scenario: Undo removes the last added shape
  Given the user has drawn a rectangle then an ellipse
  When the user presses Ctrl+Z
  Then the ellipse is gone and the rectangle remains
  And a save is scheduled

#### Scenario: Redo restores the undone shape
  Given the user undid the ellipse
  When the user presses Ctrl+Shift+Z
  Then the ellipse is back

#### Scenario: New mutation clears the redo stack
  Given the user undid the ellipse
  When the user draws a line
  Then Ctrl+Shift+Z does nothing

#### Scenario: Undo restores bindings
  Given the user deleted a rectangle that had a bound arrow (arrow was detached)
  When the user presses Ctrl+Z
  Then the rectangle is back and the arrow's binding to it is restored

#### Scenario: Viewport changes are not history entries
  Given the user drew a shape then panned and zoomed
  When the user presses Ctrl+Z
  Then the shape is removed and the viewport does not change

### Feature: Resize (FR-B2)

#### Scenario: Corner-resize a rectangle
  Given a selected 100×100 rectangle
  When the user drags its bottom-right handle +50,+50
  Then the rectangle is 150×150

#### Scenario: Resize respects the minimum size
  Given a selected 20×20 rectangle
  When the user drags a corner handle far past the opposite corner
  Then the rectangle never goes below 8×8 and no negative dimensions are stored

#### Scenario: Resizing a bound shape re-routes its connectors
  Given a rectangle with a bound arrow anchored on its edge
  When the user resizes the rectangle
  Then the arrow endpoint stays on the rectangle's boundary

#### Scenario: Dragging an arrow endpoint re-resolves binding
  Given a selected unbound arrow
  When the user drags its head endpoint onto a rectangle
  Then the arrow's endBinding references that rectangle and the head anchors to its edge

### Feature: Multi-select (FR-B3)

#### Scenario: Shift-click builds a selection set
  Given two rectangles "a" and "b"
  When the user clicks "a" then shift-clicks "b"
  Then both are selected with one combined outline

#### Scenario: Marquee selects intersecting elements
  Given three shapes, two inside the dragged region and one outside
  When the user drags a marquee over the region with the select tool
  Then exactly the two intersecting shapes are selected

#### Scenario: Group move and group delete
  Given shapes "a" and "b" selected together
  When the user drags "a" by 30,30 and then presses Delete
  Then both moved by 30,30 before deletion and both are removed

#### Scenario: Handles hidden for multi-selection
  Given two selected shapes
  Then no resize handles are rendered

### Feature: Style editing (FR-B4)

#### Scenario: Change stroke color of a selection
  Given a selected rectangle and line
  When the user picks the red palette swatch
  Then both elements render with red strokes and the change persists after reload

#### Scenario: Fill only applies to shapes
  Given a selected rectangle and a selected line
  When the user picks a fill color
  Then the rectangle gains the fill and the line is unchanged

#### Scenario: New elements adopt last-used style
  Given the user set stroke width 4 on a previous element
  When the user draws a new line
  Then the new line has stroke width 4

#### Scenario: Style change is undoable
  Given the user changed a rectangle's stroke to red
  When the user presses Ctrl+Z
  Then the rectangle's previous stroke is restored

### Feature: Edge-anchored connectors (FR-B5)

#### Scenario: Arrowhead lands on the shape edge
  Given a rectangle and an arrow drawn ending inside it
  When the arrow is committed
  Then the arrow's end point lies on the rectangle's boundary (±4 px gap), not its center

#### Scenario: Edge anchor follows a moved shape
  Given an arrow edge-anchored to an ellipse
  When the ellipse moves 100 px right
  Then the arrow endpoint recomputes to the ellipse's new perimeter

#### Scenario: Legacy center-anchored scenes still load
  Given a persisted scene from spec-12 with center-anchored points
  When the diagram loads
  Then it renders without error and re-anchors only when a bound shape next moves

### Feature: Text editing (FR-B6)

#### Scenario: Double-click edits existing text
  Given a text element reading "draft"
  When the user double-clicks it with the select tool, types " v2", and presses Enter
  Then the element reads "draft v2"

#### Scenario: Clearing text deletes the element
  Given a text element being edited
  When the user deletes all characters and commits
  Then the element is removed from the scene

#### Scenario: Escape cancels the edit
  Given a text element "keep" being edited with new text typed
  When the user presses Escape
  Then the element still reads "keep"

### Feature: Keyboard shortcuts (FR-B7)

#### Scenario: Tool keys switch tools
  Given the canvas is focused and no text input is active
  When the user presses "R"
  Then the rectangle tool becomes active and its toolbar button shows pressed

#### Scenario: Shortcuts never fire inside text input
  Given the inline text input is focused
  When the user types "r"
  Then the letter is entered and the active tool does not change

#### Scenario: Arrow keys nudge the selection
  Given a selected rectangle at x=100
  When the user presses ArrowRight twice and Shift+ArrowRight once
  Then the rectangle is at x=112

### Feature: Export (FR-B8)

#### Scenario: Export SVG crops to content
  Given a diagram with shapes spanning a 300×200 region
  When the user exports as SVG
  Then the downloaded SVG viewBox is 332×232 (16 px padding) and contains no selection artifacts

#### Scenario: Export PNG bakes the theme
  Given dark mode is active and elements use currentColor strokes
  When the user exports as PNG
  Then strokes render in the dark-theme text color on an opaque dark background at 2× scale

#### Scenario: Export disabled on an empty diagram
  Given a diagram with zero elements
  Then the export control is disabled

## Tasks

### Part A — Remediation (land first, independent commits)

### ICT-1: Repair apps/web typecheck and build
- **What**: Add `@types/node` dev dep; set `composite: true` in `tsconfig.node.json`; fix project references so `vue-tsc --noEmit` and `vite build` pass.
- **Where**: `apps/web/tsconfig.json`, `apps/web/tsconfig.node.json`, `apps/web/package.json`
- **Validated by**: Typecheck and build pass
- **Estimate**: S

### ICT-2: Split store error channels + save retry
- **What**: Replace single `error` ref with `listError`/`loadError`/`saveError`; canvas error shell keys off `loadError` only; save failure sets `saveError`, shows one toast, retries with backoff (e.g. 2s/5s/15s, capped) until success or diagram close; indicator shows "Save failed — retrying"; success clears it.
- **Where**: `apps/web/src/stores/diagrams.ts`, `DiagramCanvas.vue`, `DiagramToolbar.vue`, `DiagramsView.vue`
- **Validated by**: Failed autosave keeps the canvas editable; Save recovers after a transient failure; Load failure still shows the error shell; List error does not leak into the editor
- **Estimate**: M

### ICT-3: Detach bindings when a connector is dragged
- **What**: In `updateElement` (or the move path), when the patched element is a line/arrow with bindings and the patch moves its points, null both bindings.
- **Where**: `apps/web/src/stores/diagrams.ts`, `apps/web/src/features/diagrams/useSelection.ts`
- **Validated by**: Dragging a bound arrow detaches it
- **Estimate**: S

### ICT-4: Wheel pans, modifier-wheel zooms
- **What**: Rework `onCanvasWheel`: no modifier → pan by deltaX/deltaY (zoom-adjusted); ctrl/metaKey → existing zoom-to-cursor.
- **Where**: `apps/web/src/features/diagrams/DiagramCanvas.vue`
- **Validated by**: Plain wheel pans; Ctrl+wheel zooms toward the cursor
- **Estimate**: S

### ICT-5: Zoom-compensated hit targets
- **What**: Bind hit-target `stroke-width` to `12 / zoom` (pass zoom into `DiagramElementView` or read store) so screen hit area is constant.
- **Where**: `apps/web/src/features/diagrams/DiagramElementView.vue`, `DiagramCanvas.vue`
- **Validated by**: Selecting a line at 10% zoom
- **Estimate**: S

### ICT-6: Toolbar zoom around viewport center
- **What**: `zoomIn`/`zoomOut`/`resetZoom` compute new scroll so the scene point at viewport center stays fixed (needs canvas dimensions — expose via store or element query).
- **Where**: `apps/web/src/features/diagrams/DiagramToolbar.vue`, `apps/web/src/stores/diagrams.ts`
- **Validated by**: Zoom-in keeps the viewport center fixed
- **Estimate**: S

### ICT-7: zod caps on scene_json
- **What**: `DiagramSceneSchema`: max 1,000 elements; pen points max 2,000; text max 1,000 chars; title cap already exists. API returns 400 on violation via existing pipe.
- **Where**: `packages/shared/src/dtos.ts`, `apps/api/src/modules/diagrams/diagrams.service.spec.ts`
- **Validated by**: Oversized scene rejected by API; Scene at the cap is accepted
- **Estimate**: S

### ICT-8: Pen throttling + RDP simplification
- **What**: During pen capture, skip samples closer than ~2 scene px; on commit, run Ramer–Douglas–Peucker (epsilon ~1 scene px) before building the element. Pure functions in `useDrawTools.ts` with unit tests.
- **Where**: `apps/web/src/features/diagrams/useDrawTools.ts`, `DiagramCanvas.vue`
- **Validated by**: Pen stroke is simplified on commit
- **Estimate**: M

### ICT-9: pointercancel handling
- **What**: `@pointercancel` on the SVG resets pan/move/draw (later: resize/marquee) state and clears previews without committing.
- **Where**: `apps/web/src/features/diagrams/DiagramCanvas.vue`
- **Validated by**: pointercancel aborts an in-progress draw
- **Estimate**: S

### Part B — Professional upgrade (ordered by dependency)

### ICT-10: Undo/redo history
- **What**: `useHistory` composable / store extension: bounded stack (50) of `elements` snapshots; record on every committed mutation (add/update-commit/remove); Ctrl+Z / Ctrl+Shift+Z handlers (skip when text input focused); undo/redo replaces `elements` and schedules save; new mutation clears redo. Drag/resize gestures record one entry per gesture (snapshot at gesture start, commit at pointerup), not per pointermove.
- **Where**: `apps/web/src/stores/diagrams.ts`, new `apps/web/src/features/diagrams/useHistory.ts`, `DiagramCanvas.vue`
- **Validated by**: Undo removes the last added shape; Redo restores the undone shape; New mutation clears the redo stack; Undo restores bindings; Viewport changes are not history entries
- **Estimate**: M

### ICT-11: Multi-select — store refactor, shift-click, marquee
- **What**: `selectedId` → `selectedIds: string[]` (keep `selectElement` for single); shift-click toggles membership; marquee drag on empty canvas (new `useMarquee` composable + preview rect) selects bbox-intersecting elements; combined selection outline; group move (one history entry) and group delete with binding detach; handles suppressed for multi-selections.
- **Where**: `apps/web/src/stores/diagrams.ts`, `DiagramCanvas.vue`, `useSelection.ts`, new `useMarquee.ts`
- **Validated by**: Shift-click builds a selection set; Marquee selects intersecting elements; Group move and group delete; Handles hidden for multi-selection
- **Estimate**: L

### ICT-12: Edge-anchored connector geometry
- **What**: New `connectorGeometry.ts`: pure intersection of segment-to-center with rect bbox edge and ellipse perimeter + 4 px gap; `recomputeBoundConnectors` and creation-time `resolveLinearEndpoints` use it (both-bound arrows compute against each other's centers). Update spec-12 center-anchoring tests. Legacy scenes re-anchor lazily on next move.
- **Where**: new `apps/web/src/features/diagrams/connectorGeometry.ts`, `connectors.ts`, `apps/web/src/stores/diagrams.ts`, `DiagramCanvas.vue`, `__tests__/`
- **Validated by**: Arrowhead lands on the shape edge; Edge anchor follows a moved shape; Legacy center-anchored scenes still load
- **Estimate**: M

### ICT-13: Resize handles + linear endpoint handles
- **What**: New `DiagramSelectionHandles.vue` (8 handles, zoom-compensated size) + `useResize` composable: corner/edge drag resizes rect/ellipse (min 8×8, flip-safe); text corner-resize scales fontSize; line/arrow render endpoint handles — dragging re-positions the point and re-runs binding resolution; resizing a bound shape re-routes connectors via ICT-12; one history entry per gesture; pointercancel-safe.
- **Where**: new `apps/web/src/features/diagrams/DiagramSelectionHandles.vue`, new `useResize.ts`, `DiagramCanvas.vue`, `useSelection.ts`
- **Validated by**: Corner-resize a rectangle; Resize respects the minimum size; Resizing a bound shape re-routes its connectors; Dragging an arrow endpoint re-resolves binding
- **Estimate**: L

### ICT-14: Style panel
- **What**: New `DiagramStylePanel.vue` shown when selection non-empty: stroke palette (incl. theme default `currentColor`), fill (shapes only), stroke width 1/2/4, font size S/M/L (text only); applies to all applicable selected elements as one history entry; last-used style remembered in store and applied to new elements.
- **Where**: new `apps/web/src/features/diagrams/DiagramStylePanel.vue`, `apps/web/src/stores/diagrams.ts`, `useDrawTools.ts`, `DiagramsView.vue`
- **Validated by**: Change stroke color of a selection; Fill only applies to shapes; New elements adopt last-used style; Style change is undoable
- **Estimate**: M

### ICT-15: Double-click text editing
- **What**: dblclick on a text element with select tool opens the existing foreignObject input pre-filled at the element position; Enter/blur commits (empty → delete element); Escape cancels; one history entry.
- **Where**: `apps/web/src/features/diagrams/DiagramCanvas.vue`, `useDrawTools.ts`
- **Validated by**: Double-click edits existing text; Clearing text deletes the element; Escape cancels the edit
- **Estimate**: M

### ICT-16: Keyboard shortcuts + nudge
- **What**: Tool keys V/H/R/E(+O)/L/A/T/P (guarded by `isTextInputFocused`); arrow-key nudge 1 px, Shift 10 px, applied to the whole selection with debounced history commit; Escape clears selection; shortcut hints appended to toolbar aria-labels/tooltips.
- **Where**: `apps/web/src/features/diagrams/DiagramCanvas.vue`, `DiagramToolbar.vue`
- **Validated by**: Tool keys switch tools; Shortcuts never fire inside text input; Arrow keys nudge the selection
- **Estimate**: M

### ICT-17: Export PNG / SVG
- **What**: New `exportDiagram.ts`: serialize committed elements only, crop to content bbox + 16 px padding, bake `currentColor`/theme tokens to literal colors, SVG → Blob download; PNG via Image + canvas at 2× with opaque theme background. Toolbar export menu, disabled when empty.
- **Where**: new `apps/web/src/features/diagrams/exportDiagram.ts`, `DiagramToolbar.vue`
- **Validated by**: Export SVG crops to content; Export PNG bakes the theme; Export disabled on an empty diagram
- **Estimate**: M

## Open questions

None blocking. Spec assumptions to confirm during review: anchor gap 4 px, history depth 50, FR-A7 caps (1,000 elements / 2,000 pen points / 1,000 text chars), palette presets.

## Dependencies

- spec-11 (canvas) and spec-12 (connectors) shipped; spec-12 FR-2 center anchoring superseded by ICT-12.
- No new external libraries; no DB migrations; API contracts unchanged except 400 on oversized scenes.
- Ordering: ICT-1…9 (Part A) land before Part B. Within Part B: ICT-10 → ICT-11 → ICT-12 → ICT-13 → ICT-14…17 (14–17 independent of each other).
