# PRD: Diagram Canvas (native Vue SVG)

**Spec**: tasks/specs/spec-11-diagram-canvas.md

## Summary
A native Vue + SVG drawing canvas (no React/Excalidraw/tldraw) for sketching workflow
diagrams. Phase 1 ships standalone diagrams as a vertical slice mirroring Notes: a
`diagram` table, REST CRUD, a Zod-validated `scene_json` contract in `shared`, a Diagrams
sidebar section, and an SVG canvas with a minimal primitive set (rect, ellipse, line,
arrow, text, pen), single-select move/delete, pan/zoom, and debounced autosave.

## Behavior scenarios

### Feature: Diagram lifecycle (CRUD)

#### Scenario: Create a diagram
  Given the Diagrams section is open
  When the user clicks "New diagram"
  Then a diagram is created with title "Untitled diagram" and an empty scene
  And the app navigates to that diagram's canvas

#### Scenario: List diagrams most-recent-first
  Given three diagrams exist, last edited in the order A then C then B
  When the user opens the Diagrams section
  Then the list shows B, C, A from top to bottom

#### Scenario: Empty diagrams state
  Given no diagrams exist
  When the user opens the Diagrams section
  Then "No diagrams yet" is shown and no diagram rows are listed

#### Scenario: Rename a diagram
  Given a diagram titled "Untitled diagram"
  When the user edits the title to "Auth flow" and commits
  Then the diagram title persists as "Auth flow"

#### Scenario: Empty title falls back to default
  Given a diagram titled "Auth flow"
  When the user clears the title and commits
  Then the stored title is "Untitled diagram"

#### Scenario: Delete the open diagram
  Given a diagram is open on the canvas
  When the user deletes it
  Then the diagram is removed from the list
  And the app returns to the Diagrams empty/list state

#### Scenario: Fetch a missing diagram
  Given no diagram with id 999 exists
  When a GET /diagrams/999 is made
  Then the API responds 404

### Feature: scene_json contract

#### Scenario: Reject an invalid scene on write
  Given a PATCH /diagrams/:id body whose scene_json has an element with type "triangle"
  When the request is validated
  Then the API responds 400 and the diagram is not modified

#### Scenario: Accept a valid scene on write
  Given a PATCH body with a scene containing one rectangle element and a viewport
  When the request is validated
  Then the API responds 200 and the stored scene round-trips identically on next GET

### Feature: Canvas — pan and zoom

#### Scenario: Pan translates the viewport
  Given a diagram open with the Hand tool active
  When the user drags the empty canvas by (100, 60) screen pixels
  Then the scene viewport scrollX/scrollY change accordingly
  And drawn elements visually shift by the same amount

#### Scenario: Zoom is clamped
  Given the canvas at maximum zoom
  When the user scrolls to zoom in further
  Then the zoom level does not exceed the maximum clamp

#### Scenario: Viewport restored on reopen
  Given a diagram saved with scrollX 200, scrollY 100, zoom 1.5
  When the user reopens that diagram
  Then the canvas renders at scrollX 200, scrollY 100, zoom 1.5

### Feature: Canvas — draw primitives

#### Scenario: Draw a rectangle
  Given the Rectangle tool is active
  When the user presses at (10,10) and releases at (110,80)
  Then a rectangle element with x 10, y 10, width 100, height 70 is added to the scene

#### Scenario: Draw an arrow with a head
  Given the Arrow tool is active
  When the user drags from (0,0) to (50,0)
  Then an arrow element with points [[0,0],[50,0]] is added
  And it renders with an arrowhead marker at the end point

#### Scenario: Place and type text
  Given the Text tool is active
  When the user clicks at (20,20) and types "start"
  Then a text element with text "start" at (20,20) is added to the scene

#### Scenario: Pen stores raw points without smoothing
  Given the Pen tool is active
  When the user draws a freehand stroke capturing 12 points
  Then a pen element with exactly those 12 points (unsmoothed) is added

### Feature: Canvas — select, move, delete

#### Scenario: Select an element by clicking it
  Given a scene with one ellipse and the Select tool active
  When the user clicks on the ellipse
  Then the ellipse is selected and shows a selection outline

#### Scenario: Move a selected element
  Given a selected rectangle at x 10, y 10
  When the user drags it by (40, 0) in scene space
  Then the rectangle's x becomes 50 and y stays 10

#### Scenario: Delete the selected element
  Given a selected element
  When the user presses Delete
  Then the element is removed from the scene

#### Scenario: Single selection only
  Given a scene with two elements and one already selected
  When the user clicks the other element
  Then only the second element is selected

#### Scenario: Escape cancels the active draw
  Given the Rectangle tool is mid-drag
  When the user presses Escape
  Then no rectangle is added and the drag is cancelled

### Feature: Autosave and load

#### Scenario: Mutation triggers one debounced save
  Given a diagram open
  When the user adds three elements within 300ms of each other
  Then a single PATCH /diagrams/:id is sent after the debounce window
  And the save indicator shows "saving" then "saved"

#### Scenario: Reopen hydrates the full scene
  Given a saved diagram with 5 elements
  When the user reopens it
  Then all 5 elements render exactly as last saved

#### Scenario: Load error is surfaced
  Given GET /diagrams/:id fails
  When the canvas attempts to load
  Then an error state is shown instead of a blank canvas

## Tasks

### ICT-1: Diagram scene contract in shared
- **What**: Add `DiagramViewportSchema`, `DiagramElementSchema` (discriminated union on `type`: rectangle, ellipse, line, arrow, text, pen), `DiagramSceneSchema` to `dtos.ts`; `Diagram` entity interface to `entities.ts`; `CreateDiagramDtoSchema`/`UpdateDiagramDtoSchema` (`title?`, `scene_json?`) + inferred types; export all via `index.ts`. Build the package.
- **Where**: `packages/shared/src/dtos.ts`, `entities.ts`, `index.ts`
- **Validated by**: Reject an invalid scene on write; Accept a valid scene on write
- **Estimate**: M

### ICT-2: Diagram entity + migration
- **What**: `DiagramEntity` (table `diagrams`: id, title text default '', scene_json text with JSON transformer, created_at, updated_at + index on updated_at). New TypeORM migration creating the table; register it in `app.module.ts` migrations array and `database/data-source.ts`; register the entity in the TypeORM `entities` config.
- **Where**: `apps/api/src/modules/diagrams/entities/diagram.entity.ts`, `apps/api/src/database/migrations/*-AddDiagrams.ts`, `app.module.ts`, `database/data-source.ts`
- **Validated by**: Create a diagram; Reopen hydrates the full scene
- **Estimate**: M

### ICT-3: Diagrams service + controller
- **What**: `DiagramsService` (list recency-sorted, get-or-404, create with empty/validated scene, patch title+scene with empty-title→"Untitled diagram" fallback, hard delete) and `DiagramsController` mirroring `NotesController` at `/diagrams` with `ZodValidationPipe` on create/patch. Register `DiagramsModule`. Service spec covering CRUD + 404 + scene validation + title fallback.
- **Where**: `apps/api/src/modules/diagrams/diagrams.service.ts`, `diagrams.controller.ts`, `diagrams.module.ts`, `diagrams.service.spec.ts`, `app.module.ts`
- **Validated by**: Create a diagram; List diagrams most-recent-first; Rename a diagram; Empty title falls back to default; Delete the open diagram; Fetch a missing diagram; Reject an invalid scene on write; Accept a valid scene on write
- **Estimate**: M

### ICT-4: Web API client + Pinia store
- **What**: `api/diagrams.ts` (list/get/create/patch/delete) mirroring `notes.ts`. `stores/diagrams.ts`: list state + load/create/rename/remove actions; `useDiagramStore` (or canvas store) holding `elements`, `viewport`, `tool`, `selectedId`, dirty/saving flags, screen↔scene transform helpers, and a debounced autosave action that PATCHes scene_json+title.
- **What (tests)**: vitest spec (fake timers) — N mutations within the window produce exactly one PATCH; load hydrates store from `scene_json`; fetch failure sets the error flag.
- **Where**: `apps/web/src/api/diagrams.ts`, `apps/web/src/stores/diagrams.ts`, `apps/web/src/stores/__tests__/diagrams.spec.ts`
- **Validated by**: Mutation triggers one debounced save; Reopen hydrates the full scene; Load error is surfaced; Viewport restored on reopen
- **Estimate**: M

### ICT-5: DiagramCanvas — render + viewport
- **What**: `DiagramCanvas.vue` root `<svg>` with a viewport transform group; render each scene element to its native SVG node (`rect`, `ellipse`, `line`, `polyline`/`path` for pen, `text`/`foreignObject`, `<marker>` arrowhead); pan (hand/space-drag) and zoom (scroll/pinch/+−) with clamps; hydrate from store on mount; show load spinner/error.
- **What (tests)**: vitest + `@vue/test-utils` specs for the linked scenarios — pan delta → viewport change, zoom clamp at max, viewport restore on reopen, arrow renders an arrowhead `<marker>`, load-error state shown.
- **Where**: `apps/web/src/features/diagrams/DiagramCanvas.vue`, `apps/web/src/features/diagrams/__tests__/DiagramCanvas.spec.ts`
- **Validated by**: Pan translates the viewport; Zoom is clamped; Viewport restored on reopen; Draw an arrow with a head (render side); Load error is surfaced
- **Estimate**: L

### ICT-6: Drawing tools — create primitives
- **What**: Pointer handlers per tool to create elements into the store: rectangle, ellipse (click-drag sizing), line, arrow (two-point), text (click-place + inline typing via `foreignObject`/contenteditable), pen (raw point capture, no smoothing). Escape cancels the in-progress draw.
- **What (tests)**: vitest specs asserting each tool appends the expected element — rect geometry from a drag, arrow two-point + arrowhead, text string at the click point, pen exact raw points, Escape adds nothing.
- **Where**: `apps/web/src/features/diagrams/DiagramCanvas.vue` (+ small tool helpers), `apps/web/src/features/diagrams/__tests__/DiagramTools.spec.ts`
- **Validated by**: Draw a rectangle; Draw an arrow with a head; Place and type text; Pen stores raw points without smoothing; Escape cancels the active draw
- **Estimate**: L

### ICT-7: Selection — select, move, delete
- **What**: Select tool: click hit-test (SVG node → element id), single-selection state, selection outline overlay; drag-to-move translating element geometry in scene space; Delete/Backspace removes selected element.
- **Note**: "SVG = free hit-testing" holds for filled shapes but NOT thin strokes — a 1px line/arrow is nearly unclickable. Render lines/arrows/pen with a transparent wide-stroke (`stroke="transparent"` ~12px) sibling/overlay path as the hit target so picking works.
- **What (tests)**: vitest specs — click selects the element under the pointer, drag updates geometry by the scene-space delta, Delete removes it, clicking a second element replaces (not adds to) selection.
- **Where**: `apps/web/src/features/diagrams/DiagramCanvas.vue` (+ store selection actions), `apps/web/src/features/diagrams/__tests__/DiagramSelection.spec.ts`
- **Validated by**: Select an element by clicking it; Move a selected element; Delete the selected element; Single selection only
- **Estimate**: M

### ICT-8: DiagramToolbar
- **What**: `DiagramToolbar.vue` — tool buttons (select, hand, rectangle, ellipse, line, arrow, text, pen) bound to store tool state, zoom controls (+/−/reset), and a saving/saved indicator. Real `<button>`s with `aria-label` + `focus-ring`; respect `prefers-reduced-motion`.
- **What (tests)**: vitest spec — clicking a tool button sets the store tool; save indicator reflects saving→saved state.
- **Where**: `apps/web/src/features/diagrams/DiagramToolbar.vue`, `apps/web/src/features/diagrams/__tests__/DiagramToolbar.spec.ts`
- **Validated by**: Mutation triggers one debounced save (indicator); Draw a rectangle (tool select); Pan translates the viewport (hand tool)
- **Estimate**: M

### ICT-9: DiagramsView + routes
- **What**: `DiagramsView.vue` route shell hosting list (empty/loading/error) and canvas+toolbar; add routes `/diagrams` and `/diagrams/:id` to `router/index.ts`; add `Diagrams` to the `DefaultLayout` `routeLabel` map; navigate on create/delete.
- **Where**: `apps/web/src/features/diagrams/DiagramsView.vue`, `apps/web/src/router/index.ts`
- **Validated by**: Create a diagram (navigation); Delete the open diagram (return to list); Empty diagrams state
- **Estimate**: M

### ICT-10: Sidebar Diagrams section
- **What**: `DiagramList.vue` (mirror `NoteList.vue`) + a Diagrams nav section in `DefaultLayout.vue` (link + expandable list + "New diagram" add button + empty state + active-route styling), wired to the diagrams store.
- **Where**: `apps/web/src/features/diagrams/DiagramList.vue`, `apps/web/src/layouts/DefaultLayout.vue`
- **Validated by**: List diagrams most-recent-first; Empty diagrams state; Create a diagram
- **Estimate**: M

## Open questions
None — all engine, persistence, scope, and architecture decisions were resolved before
specification (native Vue SVG; standalone-only Phase 1; MVP primitive set; explicit non-goals).

## Dependencies
- `@tasknote/shared` extended with diagram schemas (ICT-1 gates ICT-2–4). **available**
- Notes vertical slice as the structural template. **available**
- TypeORM migration registration (`app.module.ts`, `data-source.ts`). **available**
