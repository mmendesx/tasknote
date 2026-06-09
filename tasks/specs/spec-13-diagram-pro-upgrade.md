# Spec: Diagram Tool Remediation + Professional Upgrade

## Overview

The diagram tool (spec-11 canvas, spec-12 connectors) ships a working Phase-1 MVP, but a 2026-06-09 audit found eight Important defects that make it feel broken (failed autosave hides the canvas, stale connector bindings, wheel-zoom hijack, unselectable elements when zoomed out) and the Phase-1 feature deferrals now define the gap to a professional lightweight canvas (Excalidraw / Draw.io class). This spec covers Part A (fix all audit findings) and Part B (the deferred professional features, now in scope). Architecture stays: Vue 3 + Pinia + native SVG, NestJS + TypeORM, shared zod schemas — extend, don't rewrite.

## Actors

- **User** — single local user drawing, editing, and exporting diagrams.
- **Web app** (`apps/web`) — Vue 3 SPA, Pinia `diagrams` store, SVG canvas.
- **API** (`apps/api`) — NestJS `diagrams` module persisting `scene_json` via TypeORM.

## Functional requirements

### Part A — Remediation

### FR-A1: Save failure never unmounts the canvas
A failed autosave must not replace the canvas with the load-error screen. The store separates error channels: `listError` (list ops), `loadError` (diagram load), `saveError` (autosave). `DiagramCanvas.vue` swaps to its error shell only on `loadError`. On `saveError`: canvas stays mounted and editable, the toolbar save indicator shows "Save failed — retrying", a toast appears once (not per retry), and the store retries the save with backoff until success or diagram close. A successful save clears `saveError`.

### FR-A2: Moving a connector unbinds it
Dragging an arrow/line that has `startBinding`/`endBinding` with the select tool clears both bindings (Excalidraw behavior: a manually repositioned connector is detached). The connector keeps its translated points and never snaps back when a previously-bound shape later moves.

### FR-A3: Wheel pans; modifier wheel zooms
Plain wheel/trackpad scroll pans the viewport (deltaX/deltaY). `Ctrl`/`Cmd` + wheel zooms toward the cursor (existing zoom-to-cursor math reused). Pinch gestures (which browsers deliver as ctrl+wheel) therefore zoom.

### FR-A4: Hit targets stay ≥ 12 screen px at any zoom
The transparent hit-target strokes on lines, arrows, pen strokes, and unfilled shapes compute their stroke-width as `12 / zoom` (scene units), so the effective screen hit area is constant. Selection must work at 10% zoom.

### FR-A5: Toolbar zoom centers on the viewport
Zoom in / zoom out / reset-zoom buttons keep the scene point at the viewport center fixed (adjust `scrollX`/`scrollY` accordingly), instead of zooming toward the top-left origin.

### FR-A6: Web build and typecheck pass
`npm run typecheck` and `npm run build` in `apps/web` succeed: add `@types/node` dev dependency, set `composite: true` in `tsconfig.node.json`, and repair project references so `vue-tsc` runs clean.

### FR-A7: Scene payloads are bounded
- Schema (`packages/shared/src/dtos.ts`): max 1,000 elements per scene; max 2,000 points per pen element; max 1,000 chars per text element; max 10,000 chars total… enforced by zod so the API rejects oversized scenes with 400.
- Client: pen capture throttles pointermove sampling (min distance ~2 scene px between points) and runs Ramer–Douglas–Peucker simplification (epsilon ~1 scene px) on commit, before the element is stored.

### FR-A8: Interrupted gestures reset cleanly
A `pointercancel` event (touch interruption, OS gesture steal) cancels any in-progress draw, move, resize, or marquee: previews clear, state machines return to idle, no partial element is committed.

### Part B — Professional upgrade

### FR-B1: Undo / redo
Every committed scene mutation (add, move, resize, style change, delete, text edit, connector detach/bind) pushes onto an undo stack (bounded, ≥ 50 entries). `Ctrl/Cmd+Z` undoes, `Ctrl/Cmd+Shift+Z` redoes. Undo/redo restores `elements` exactly (including bindings) and schedules a save. Selection, tool, and viewport changes are not history entries. A new user mutation after undo clears the redo stack.

### FR-B2: Resize handles
Selecting a single rectangle, ellipse, or text element shows 8 handles (corners + edges) on the selection bbox. Dragging a handle resizes (corner = both axes, edge = one axis); minimum size 8×8 scene px; crossing over flips normally (no negative dimensions persisted). Text resizes by scaling `fontSize` proportionally (corner handles only). Lines/arrows/pen get endpoint handles instead: dragging a line/arrow endpoint repositions that point, and for arrows re-runs binding resolution (may bind/unbind per FR-B5). Resizing a bound shape re-routes its connectors per FR-B5.

### FR-B3: Multi-select
- Shift-click toggles an element in/out of the selection set.
- Dragging on empty canvas with the select tool draws a marquee; on release, all elements whose bbox intersects the marquee are selected.
- The selection set renders one combined outline; dragging any selected element moves the whole set; Delete removes the whole set (detaching bindings per existing rules).
- Resize handles appear only for single selections.
- Store `selectedId: string | null` becomes `selectedIds: string[]` (or `Set`), with single-select behavior preserved for plain clicks.

### FR-B4: Style editing
When selection is non-empty, a style panel (floating or toolbar-anchored) offers: stroke color (preset palette + theme default `currentColor`), fill (none + palette) for shapes, stroke width (1/2/4), and font size (S/M/L) for text. Changes apply to every applicable selected element immediately, persist through autosave, and are undoable. New elements adopt the last-used style (per session).

### FR-B5: Edge-anchored connectors (supersedes spec-12 FR-2)
A bound arrow endpoint anchors to the intersection of the line-to-shape-center with the shape's boundary (rectangle: bbox edge; ellipse: ellipse perimeter), plus a small gap (~4 scene px), so arrowheads are always visible. Recompute on: connector creation, bound-shape move, bound-shape resize. Both-ends-bound arrows compute against each other's centers. Stored `points` remain plain coordinates (schema unchanged); bindings remain `{ elementId }`.

### FR-B6: Edit existing text
Double-clicking a text element with the select tool opens the same inline `foreignObject` input pre-filled with its text at its position. Enter/blur commits the changed text (empty text deletes the element); Escape cancels without change. Committing is one undo entry.

### FR-B7: Keyboard shortcuts
With canvas focused and no text input active: `V` select, `H` hand, `R` rectangle, `E` ellipse (and `O` alias), `L` line, `A` arrow, `T` text, `P` pen. Arrow keys nudge the selection 1 scene px (`Shift`+arrow = 10 px), committing one undo entry per keydown burst (debounced). `Escape` clears selection (in addition to canceling draws). Shortcuts are listed in tool button tooltips/aria-labels.

### FR-B8: Export PNG / SVG
An Export control in the toolbar offers "Export as SVG" and "Export as PNG". Export serializes the committed elements (no selection outlines, previews, or handles) cropped to the content bounding box plus 16 px padding, with theme-resolved colors (`currentColor` baked to the current theme's text color) and an opaque background for PNG (theme bg). PNG renders at 2× scale. Implemented client-side (SVG string → Blob; PNG via Image + canvas rasterization). Empty diagrams disable the control.

## Technical requirements

### Architecture

- All Part A/B canvas work lives in `apps/web/src/features/diagrams/` and `apps/web/src/stores/diagrams.ts` — same module layout, new composables where a concern is new (`useHistory`, `useResize`, `useMarquee`, `exportDiagram.ts`, `connectorGeometry.ts`).
- `connectors.ts` gains edge-intersection geometry (pure functions, unit-testable). `recomputeBoundConnectors` in the store delegates to it.
- Undo history is store-level (Pinia), snapshot-based (immutable `elements` arrays are already copied on mutation — snapshots are cheap references).
- No new backend endpoints. Backend changes limited to shared zod schema caps (FR-A7) which the existing `ZodValidationPipe` enforces.

### Data model

- No DB migrations. `scene_json` schema is extended additively: existing element fields suffice for style editing (stroke/fill/strokeWidth/fontSize already exist); zod caps added (FR-A7). `version` stays 1 — all changes backward-compatible (old scenes load unchanged).

### API contracts

- Unchanged endpoints. `PATCH /diagrams/:id` now returns 400 with zod details when scene exceeds FR-A7 caps.

### UI structure

- `DiagramToolbar.vue`: + Export menu, shortcut hints in labels.
- New `DiagramStylePanel.vue`: style controls, visible when selection non-empty.
- `DiagramCanvas.vue`: wheel/pointercancel changes, marquee rendering, handle rendering (new `DiagramSelectionHandles.vue`), double-click text edit. Keep the script under control by extracting pointer state machines into composables.
- `DiagramsView.vue`: unchanged except save-failure toast wiring.

### Infrastructure

- None new. `@types/node` dev dep + tsconfig repair in `apps/web` (FR-A6).

## Non-functional requirements

### Performance
- Pointer-move work (move/resize/marquee/pen) stays O(elements) per frame; no layout thrash; 60 fps target on a 500-element scene.
- Pen simplification keeps typical strokes under 200 stored points.
- Undo snapshots are reference-sharing (no deep clone of unchanged elements).

### Security
- zod caps (FR-A7) close the unbounded-payload DoS vector. No other trust-boundary changes.

### Accessibility
- Preserve existing aria patterns (aria-pressed tools, aria-live save indicator). Style panel controls are labeled buttons/inputs; keyboard shortcuts do not trap focus and never fire while a text input is focused; handles have ≥ 12 px effective pointer targets.

### Compatibility
- Old persisted scenes (literal colors, center-anchored connector points) load and render unchanged; edge-anchoring recomputes only on the next move/resize of a bound shape.

## Dependencies

- spec-11 (diagram canvas) — shipped.
- spec-12 (connectors) — shipped; FR-2 (center anchoring) superseded by FR-B5 here.
- No external libraries required (RDP simplification and edge intersection are small pure functions; PNG export uses native canvas APIs).

## Constraints

- Keep native SVG rendering — no Excalidraw/Konva/Fabric dependency.
- No breaking changes to `scene_json` schema or API contracts (additive only).
- Existing 75 diagram tests must keep passing (except assertions that encode superseded center-anchoring, which are updated alongside FR-B5).
- One logical change per commit; bug fixes (Part A) land before/independently of features (Part B).

## Open questions

None blocking. Assumptions stated inline (anchor gap 4 px, history depth 50, caps in FR-A7, palette presets) — correct during review if needed.

## Glossary

- **Binding** — `{ elementId }` reference on an arrow/line endpoint tying it to a shape.
- **Edge anchoring** — placing a bound endpoint on the shape's boundary along the line to its center, instead of at the center.
- **Marquee** — drag-rectangle selection on empty canvas.
- **RDP** — Ramer–Douglas–Peucker polyline simplification.
