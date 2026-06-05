# Spec: Diagram Canvas (native Vue SVG)

## Overview
A hand-rolled, Excalidraw-style drawing canvas built natively in Vue with SVG, for
sketching workflow/architecture diagrams to reason about the codebase. Phase 1 ships
standalone diagrams (own sidebar section, like Notes): create, draw with a minimal
primitive set, autosave, and reopen. No third-party canvas library (no Excalidraw,
tldraw, or React).

## Actors
- **User** — creates diagrams, draws/edits shapes on the canvas, renames, deletes.
- **Diagram canvas store (frontend)** — holds the in-memory scene (element array + viewport), drives rendering and autosave.
- **Diagrams API (backend)** — persists diagram rows (`scene_json` blob) via NestJS + TypeORM.

## Functional requirements

### FR-1: Create a diagram
User creates a new diagram from the Diagrams sidebar section. A new `diagram` row is
created with an empty scene (`{ version, elements: [], appState: { viewport } }`) and a
default title (e.g. `Untitled diagram`). The app navigates to the canvas for that diagram.

### FR-2: Standalone diagram browsing
The sidebar has a **Diagrams** section (sibling of Notes) listing existing diagrams by
title, most-recently-updated first. Selecting one opens its canvas. Empty state shows
"No diagrams yet".

### FR-3: Rename a diagram
User edits the diagram title inline (sidebar row or a canvas header field). Title persists
via PATCH. Empty title falls back to `Untitled diagram`.

### FR-4: Delete a diagram
User deletes a diagram (hard delete in Phase 1 — no archive/restore). Removing the open
diagram navigates back to the Diagrams empty/list state.

### FR-5: Pan and zoom
- Pan: drag on empty canvas with the Hand/pan tool, or space-drag; viewport translates.
- Zoom: scroll / trackpad pinch / +/− controls; clamped to a min/max scale.
- Viewport (`scrollX`, `scrollY`, `zoom`) is part of the scene and is persisted, so reopen
  restores the last view.

### FR-6: Draw primitives
A toolbar offers these tools. Each created element is an entry in the scene `elements` array:
- **Rectangle** — click-drag to size.
- **Ellipse** — click-drag to size.
- **Line** — straight, two endpoints.
- **Arrow** — straight line with an arrowhead on the end point.
- **Text** — click to place, type inline; stores string + position + font size.
- **Pen (freehand)** — pointer-down draws a raw polyline of captured points (NO smoothing — see non-goals).

### FR-7: Select, move, delete elements
- **Select tool**: click an element to select it (SVG node hit-testing — the element under
  the pointer). Selected element shows a bounding outline + handles are out of scope (no
  resize in Phase 1; move only).
- **Move**: drag a selected element to translate its geometry.
- **Delete**: `Delete`/`Backspace` removes the selected element.
- Single-selection only (multi-select is a non-goal).

### FR-8: Debounced autosave
Any scene mutation (add/move/delete element, edit text, pan, zoom, retitle) marks the scene
dirty and schedules a debounced PATCH of `scene_json` (and `title` when changed) to the
backend (~500–800ms after the last change). A lightweight saved/saving indicator is shown.

### FR-9: Load on reopen
Opening a diagram fetches its row and hydrates the canvas store from `scene_json`, restoring
all elements and the viewport exactly as last saved.

## Technical requirements

### Architecture
Vertical slice mirroring the existing **Notes** feature end-to-end:

- **Rendering**: a single root `<svg>` with a `viewBox` (or a transform group) for pan/zoom.
  Each element renders as a native SVG node (`<rect>`, `<ellipse>`, `<line>`, `<polyline>`,
  `<path>` for pen, `<text>` / `<foreignObject>` for text, plus a `<marker>` for arrowheads).
  SVG chosen over `<canvas>` deliberately: every element is a DOM node, so pointer
  hit-testing and selection come for free (no manual geometry math for picking).
- **State**: a Pinia store `useDiagramStore` holding `elements`, `viewport`, current tool,
  selected element id, and dirty/saving flags. Tool interactions are pointer-event handlers
  on the SVG that mutate the store.
- **Coordinate model**: screen↔scene transform derived from viewport (`scrollX/scrollY/zoom`)
  so element coordinates are stored in scene space, independent of zoom/pan.

### Data model
New entity **`diagram`** (TypeORM, table `diagrams`), persisted via a **new migration**
(the project uses `synchronize: false`, `migrationsRun: true` — a migration is required and
must be registered in `app.module.ts` and `database/data-source.ts`).

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK autoincrement | |
| `title` | text, default `''` | |
| `scene_json` | text | JSON-serialized `DiagramScene` (stored as TEXT; transformer parses/stringifies) |
| `created_at` | datetime | `@CreateDateColumn` |
| `updated_at` | datetime | `@UpdateDateColumn`, index for recency sort |

> Phase 2 (out of scope here): `target_type` / `target_id` nullable columns to attach a
> diagram to a task or note. Schema should be designed so adding them later is additive.

**Shared schema (`packages/shared`)** — `scene_json` contract defined once with Zod and
reused by both the API (validation via `ZodValidationPipe`) and the frontend store:

- `DiagramElementSchema` — discriminated union on `type`:
  - `rectangle` / `ellipse`: `{ id, type, x, y, width, height, stroke, fill?, strokeWidth }`
  - `line` / `arrow`: `{ id, type, points: [[x,y],[x,y]], stroke, strokeWidth }`
  - `text`: `{ id, type, x, y, text, fontSize, color }`
  - `pen`: `{ id, type, points: [[x,y], ...], stroke, strokeWidth }`
- `DiagramViewportSchema` — `{ scrollX, scrollY, zoom }`
- `DiagramSceneSchema` — `{ version: number, elements: DiagramElementSchema[], appState: { viewport: DiagramViewportSchema } }`
- `Diagram` entity interface added to `entities.ts`; `CreateDiagramDtoSchema` /
  `UpdateDiagramDtoSchema` added to `dtos.ts` (`title?`, `scene_json?` as the parsed scene).
- All exported via `shared/src/index.ts`.

### API contracts
REST controller mirroring `NotesController`, mounted at `/diagrams`:

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/diagrams` | — | `Diagram[]` (recency-sorted) | — |
| GET | `/diagrams/:id` | — | `Diagram` | 404 if missing |
| POST | `/diagrams` | `CreateDiagramDto` | `201 Diagram` | 400 invalid scene |
| PATCH | `/diagrams/:id` | `UpdateDiagramDto` | `Diagram` | 400 invalid; 404 missing |
| DELETE | `/diagrams/:id` | — | `204` | 404 missing |

`scene_json` validated against `DiagramSceneSchema` on write. Frontend api client
`apps/web/src/api/diagrams.ts` mirrors `notes.ts`.

### UI structure
- **Router**: routes `/diagrams` (list/empty) and `/diagrams/:id` (canvas), registered in
  `apps/web/src/router/index.ts`; route label `Diagrams` added to `DefaultLayout` `routeLabel` map.
- **Sidebar**: a **Diagrams** nav section in `DefaultLayout.vue` (mirror the Notes section:
  link + expandable list + "New diagram" add button + empty state).
- **Components** (new `apps/web/src/features/diagrams/`):
  - `DiagramsView.vue` — route shell; loads list / hosts canvas.
  - `DiagramCanvas.vue` — the `<svg>` surface, pointer handlers, viewport transform.
  - `DiagramToolbar.vue` — tool selector (select, hand, rect, ellipse, line, arrow, text, pen) + zoom controls + save indicator.
  - `DiagramList.vue` — sidebar list of diagrams (mirror `NoteList.vue`).
  - Element render kept inline in `DiagramCanvas` (one `<component>`/`v-for` over elements) to stay within Phase-1 scope.
- **State per element type** (loading / empty / error) handled at the list and canvas-load level (spinner on load, error on fetch failure, empty state for no diagrams).

### Infrastructure
None new. Same NestJS app, same SQLite file, same Vite frontend. No WebSocket, no queue.

## Non-functional requirements

### Performance
- Target smooth drawing for diagrams up to ~200 elements (workflow-diagram scale). SVG DOM
  node count stays modest; no virtualization required in Phase 1.
- Autosave debounced to avoid a PATCH per pointer move.

### Accessibility
- Toolbar buttons are real `<button>`s with `aria-label` and visible focus (match existing
  `focus-ring` convention).
- Canvas is pointer-first; full keyboard drawing is **not** a Phase-1 requirement, but
  Delete/Backspace removes the selected element and Escape cancels the active tool/drag.
- `prefers-reduced-motion` respected for any save-indicator / transition animation.

### Compatibility
- Match existing design tokens (`@tasknote/ui`, CSS variables, dark mode) for toolbar,
  sidebar, and selection chrome.

## Dependencies
- `@tasknote/shared` — extended with diagram schemas. **available**
- Notes vertical slice — used as the structural template (entity, controller, service, api
  client, store, sidebar section, router). **available**
- TypeORM migration registration in `app.module.ts` + `data-source.ts`. **available**

## Constraints
- **No React / Excalidraw / tldraw / external canvas library.** Native Vue + SVG only.
- **No `synchronize`** — schema change ships as a registered TypeORM migration.
- Do not alter the Notes/Tasks/Boards data model; `diagram` is an independent table.
- Keep `scene_json` as a single TEXT column (no per-element rows) in Phase 1.

## Phase-1 non-goals (explicit — do NOT implement)
- Undo / redo history.
- Arrow-to-shape binding / connectors that follow shapes.
- Freehand smoothing (pen stores raw captured points only).
- Multi-select (single-selection only).
- Resize handles (move-only in Phase 1).
- PNG / SVG export.
- Realtime / multi-cursor collaboration.
- Attaching diagrams to tasks or notes (deferred Phase 2 — schema kept additive-friendly).

## Glossary
- **Scene** — the full persisted drawing state: `{ version, elements, appState.viewport }`.
- **Element** — one drawn primitive (rectangle, ellipse, line, arrow, text, pen stroke).
- **Viewport** — pan/zoom state (`scrollX`, `scrollY`, `zoom`) mapping scene space to screen.
