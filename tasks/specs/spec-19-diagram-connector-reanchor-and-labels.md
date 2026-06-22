# Spec: Diagram connector re-anchoring on move + shape labels

> **POST-IMPLEMENTATION CORRECTION (2026-06-21).**
> Feature 1 here ("re-anchor bound connector on move") was a **misread** and was
> **already implemented** in the store: `stores/diagrams.ts`
> `reanchorBoundConnectorsInPlace`, invoked by every `updateElements`, re-anchors
> bound connectors whenever a bindable shape moves/nudges. The spec-19
> reimplementation (ICT-2/3/4) was redundant and regressed the working behavior
> (its points-only patches tripped the store's connector-detach guard, nulling
> bindings after the first move). It has been **reverted**.
> The user's actual Feature-1 ask — confirmed by their screenshot — is
> **orthogonal / elbow connector routing** (right-angle bends, connector leaves
> the shape side facing the target), which is a NEW feature, not re-anchoring.
> Tracked separately for /planner. **Feature 2 (labels) shipped and stands.**

## Overview
Two enhancements to the diagram editor. (1) When a node bound to a connector
moves or is nudged, the connector's bound endpoint must re-anchor to the node's
shape perimeter live — today it goes stale and detaches visually until the user
drags the arrow endpoint. (2) Bindable shapes (rectangle, ellipse) gain an
optional text label, edited inline via double-click, reusing the existing text
editor.

## Actors
- **Editor user** — drags/nudges nodes and labels diagram shapes on the canvas.

## Context (current behavior, verified in code)
- Connector endpoints are computed by `boundEndpoint(shape, from)` in
  `apps/web/src/features/diagrams/connectors.ts`, which ray-traces to the shape
  perimeter via `rectEdgePoint` / `ellipseEdgePoint` (`connectorGeometry.ts`).
- A connector (`line` / `arrow`) stores static `points: [[x1,y1],[x2,y2]]` plus
  optional `startBinding` / `endBinding` (`{ elementId }`). **`points` is only
  rewritten on connector creation (`useCanvasPointer.resolveArrowEndpoints`) and
  on arrow-endpoint resize (`useResize.ts`).** Node **move** (`handleMovePointerMove`)
  and keyboard **nudge** (`useCanvasKeyboard.ts`) only translate selected
  elements via `buildMovePatch`; bound connectors are NOT recomputed → they go
  stale. This is the gap FR-1 closes.
- Only `rectangle` and `ellipse` are bindable (`isBindableShape`). "circle" is an
  ellipse with width == height — **no new shape types are introduced by this spec.**
- Inline text editing already exists but ONLY for `type: 'text'` elements:
  double-click → `foreignObject` HTML input, Enter commits, Escape cancels,
  empty-on-commit deletes (`DiagramCanvas.vue` dblclick handler;
  `DiagramTextEdit.spec.ts`). Persist path: `store.updateElement(s)` →
  debounced `api.diagrams.updateDiagram` PATCH. History via `pushHistory`.

## Functional requirements

### FR-1: Bound connectors re-anchor when their node moves
When a shape with id `S` is moved by pointer-drag, the bound endpoint of every
`line`/`arrow` whose `startBinding.elementId === S` or `endBinding.elementId === S`
is recomputed so it stays anchored to `S`'s perimeter, pointing at the connector's
other end.
- Recompute uses the existing `boundEndpoint(shape, from)`, where `from` is the
  *other* endpoint of that connector (its other bound shape's center if also
  bound, else its raw stored point) — matching `resolveArrowEndpoints` semantics.
- If BOTH endpoints of a connector are bound and BOTH shapes move in the same
  gesture (group move), both endpoints re-anchor.
- The update is applied within the same batched `store.updateElements` call /
  same history gesture as the move (one undo step reverts move **and** re-anchor).
- Re-anchoring is live (per `pointermove`), so the connector visibly follows the
  node during the drag, not only on drop.

### FR-2: Bound connectors re-anchor on keyboard nudge
Arrow-key nudging a bound shape (`useCanvasKeyboard.ts`) re-anchors its bound
connectors identically to FR-1, in the same batched patch / history entry as the
nudge.

### FR-3: Re-anchoring tolerates non-bound and partially-bound connectors
- A connector endpoint with no binding is left untouched.
- A connector bound to a shape that is NOT in the current move set is left
  untouched (only connectors touching a moved shape recompute).
- Moving a connector itself (selecting and dragging the line/arrow) keeps current
  behavior (translate its points); it does not spuriously re-anchor to stale
  bindings. (ponytail: re-anchor only fires for shape moves, not connector moves.)

### FR-4: Shapes carry an optional label
`rectangle` and `ellipse` elements gain an optional `label?: string` field.
- Absent/empty label → nothing rendered (no empty box, no layout shift).
- A non-empty label renders centered within the shape's bbox, clipped/wrapped to
  the shape (single line, ellipsized if it overflows — no auto-resize of the shape).
- Label is included in export (`exportDiagram.ts`) so exported SVG shows it.

### FR-5: Double-click a shape edits its label
Double-clicking a `rectangle` or `ellipse` (in select mode) opens the inline text
input over that shape, pre-filled with its current `label`.
- Enter (or blur) commits: writes `label` via `store.updateElement`, one history
  entry, persists through the existing debounced PATCH.
- Escape cancels: label unchanged.
- Committing an empty label clears it (sets `label` to `''`/undefined) — it does
  **NOT** delete the shape (unlike `type:'text'`, where empty deletes the element).
- Double-clicking a `type:'text'` element keeps its existing behavior unchanged.

### FR-6: Label editing and selection coexist
Single click still selects the shape; double-click enters label edit. Entering
label edit does not start a move gesture, and does not leave the shape in a
half-dragged state.

## Technical requirements

### Architecture
- Frontend-only. No API contract change beyond the additive `label` field flowing
  through the existing `scene_json.elements` PATCH (no new endpoint).
- FR-1/2/3: add a pure helper (e.g. `reanchorConnectorsForMovedShapes(elements,
  movedIdSet)` in `connectors.ts`) returning the connector patches, then call it
  from `handleMovePointerMove` (`useCanvasPointer.ts`) and the nudge path
  (`useCanvasKeyboard.ts`), folding its patches into the existing batched
  `updateElements` call. Reuse `boundEndpoint`, `elementCenter`, `findElementById`.
- FR-4/5/6: extend the existing dblclick dispatch in `DiagramCanvas.vue` to route
  `rectangle`/`ellipse` to label edit; reuse the current `foreignObject` text
  input component/state. Render label in `DiagramElementView.vue` (and the export
  builder) as centered SVG `<text>` within the shape bbox.

### Data model
- `DiagramElementSchema` in `packages/shared/src/dtos.ts`: add optional
  `label: z.string().optional()` to the `rectangle` and `ellipse` variants. Purely
  additive — existing scenes without `label` remain valid.
- No DB migration: scene is stored as `scene_json` (JSON blob); the new optional
  field needs no schema migration.

### UI structure
- `DiagramElementView.vue` — render `label` for rectangle/ellipse: centered
  `<text>` (text-anchor middle, dominant-baseline central) at bbox center, with
  overflow clipped/ellipsized; pointer-events none so it doesn't block shape hit.
- `DiagramCanvas.vue` — dblclick handler: `if rectangle|ellipse → open label
  editor pre-filled with el.label`; commit/cancel wired to existing input.
- `exportDiagram.ts` — emit the same centered `<text>` for labeled shapes.

### Edge cases
- Connector whose bound shape was deleted mid-session: `detachBindingsTo` already
  nulls the binding; re-anchor must skip null bindings (no crash).
- Degenerate geometry (zero-size shape): `boundEndpoint` already returns center;
  reuse as-is.
- Very long label: single line, ellipsized to shape width; shape does not grow.
- Label with only whitespace on commit → treated as empty (cleared).

## Non-functional requirements
- **Performance**: re-anchor runs per `pointermove`; helper must be O(connectors)
  and allocate only the patches it emits (no full-scene copy). Drag must stay
  smooth on scenes with dozens of connectors.
- **Accessibility**: label input reuses the existing text-edit input's a11y; the
  rendered label contributes the shape's accessible text where the SVG exposes it.
- **Undo/redo**: each gesture (move, nudge, label edit) is exactly one history
  entry, including its re-anchor side effects.
- **Compatibility**: additive `label` field; scenes saved before this feature load
  unchanged; clients that ignore `label` still render shapes.

## Dependencies
- Existing connector geometry (`connectorGeometry.ts`, `connectors.ts`) — available.
- Existing inline text-edit machinery (`DiagramCanvas.vue`, text `foreignObject`
  input) — available.
- Shared DTO package `@tasknote/shared` — available; needs the additive field.

## Constraints
- **No new shape types** (no diamond/triangle/standalone circle). "circle" =
  ellipse with equal width/height.
- Do not change the existing `type:'text'` double-click/commit/empty-deletes
  behavior.
- No new runtime dependency; reuse existing geometry + editor + persist paths
  (ponytail: rungs 3–4, not a new editor or a new anchoring model).
- Binding model stays `{ elementId }` only — no stored anchor side/port/ratio;
  anchoring remains computed from geometry each time.

## Open questions
None blocking. Both features resolved against the code:
- FR-1 scope ("edges depending on location of next item") confirmed as
  *re-anchor-on-move*, since node move currently does NOT recompute bound
  connectors (verified in `handleMovePointerMove` / `useCanvasKeyboard.ts`).
- "rectangle, circle, etc." confirmed to mean existing shapes (circle = ellipse);
  no new shape types in scope.

## Glossary
- **Bound connector** — a `line`/`arrow` with `startBinding`/`endBinding`
  referencing a shape's `elementId`.
- **Re-anchor** — recompute a bound endpoint to sit on its shape's perimeter,
  pointing at the connector's other end, via `boundEndpoint`.
- **Bindable shape** — `rectangle` or `ellipse` (`isBindableShape`).
