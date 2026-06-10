# Spec: Diagram Review Remediation (spec-13 follow-up)

## Overview

The spec-13 code review (2026-06-10) returned Request Changes: 3 blocking defects in headline features (undo history corruption on click, arrow-endpoint re-binding broken in real browsers, resize pointer-capture gap), 11 non-blocking defects, and compliance gaps (1 missing + 10 partial BDD scenarios, test hygiene, oversized files). This spec covers the full remediation so the diagram tool's review verdict flips to Approve. All work is in `apps/web` (Vue 3 + Pinia + SVG); no API or schema changes.

## Actors

- **User** — draws, selects, resizes, undoes, exports.
- **Web app** (`apps/web`) — diagram feature + Pinia store under remediation.

## Functional requirements

### Part A — Blocking (correctness)

### FR-A1: Selection clicks never pollute undo history
A plain pointerdown on an element must not push a history entry or clear the redo stack. History entries for move/resize gestures are created only when the gesture actually changes geometry — push on first effective pointermove of the gesture (or discard the pointerup entry when nothing changed). Acceptance: draw → undo → click another element → redo still works; click-select with no drag → Ctrl+Z undoes the previous real mutation in one press; double-click text edit produces exactly one history entry (the edit), no click-junk entries.

### FR-A2: Arrow-endpoint drop re-binding works in a real browser
`commitResize`'s endpoint-drop binding resolution must hit-test geometrically against `store.elements` (point-in-rect-bbox / point-in-ellipse, topmost-first, bindable shapes only) instead of `document.elementFromPoint` — eliminating both the coordinate-space bug (SVG-local vs client coords) and handle self-occlusion. New shared helper in `connectors.ts` (e.g. `findShapeAtScenePoint(scene, elements)`); the existing create-path resolver may delegate where applicable but its DOM-based behavior must not regress. The tautological test (`'newBindings' in result`) is replaced by assertions on actual binding identity: dropping an arrow endpoint on rectangle `target` yields `endBinding = { elementId: 'target' }` plus edge-anchored point; dropping on empty canvas yields `endBinding = null`.

### FR-A3: Resize gestures capture the pointer
Starting a handle drag captures the pointer so pointerup outside the SVG still ends the gesture. The unreachable `data-resize-handle` branch in `handleSelectPointerDown` is deleted. Acceptance: begin resize, release outside the canvas → `resizeState` cleared; the next pointerdown starts a fresh gesture (no warp). A pointerdown while a stale resize/move/marquee state somehow persists must reset that state first (defensive guard).

### Part B — Non-blocking defects

### FR-B1: Save lifecycle hardening
(a) Successful save cancels any pending retry timer (no redundant PATCH, no timer leak). (b) `flushSave` saves whenever `dirty` is true — including during a retry episode when the debounce timer is null — so switching/closing a diagram never silently drops edits.

### FR-B2: pointercancel restores pre-gesture geometry
pointercancel during move or resize restores the elements from the gesture's held originals (`moveState.originalElements`, `resizeState.original`) — no partially-applied geometry is committed or saved (completes FR-A8 of spec-13).

### FR-B3: Both-ends-bound arrows re-anchor both ends
When a shape bound to a both-ends-bound connector moves or resizes, BOTH endpoints recompute against each other's shapes (each end anchored along the ray to the other shape's center). The store test that encodes single-end recompute is corrected.

### FR-B4: Degenerate-geometry guards
`ellipseEdgePoint` (and `rectEdgePoint` symmetrically) return the shape center when the computation would be non-finite (zero-width/height shape, NaN denominators). No NaN is ever stored in points or serialized to export SVG.

### FR-B5: exportPng fails loudly
`exportPng` no longer silently downloads an SVG on rasterization failure: the catch is narrowed, the object URL is revoked on all paths, and failure surfaces to the caller (rejected promise) so the toolbar can show an error toast. Unit tests cover the SVG-fallback/error path and the happy-path blob plumbing (canvas mocked).

### FR-B6: Resize behavior — clamp is canonical (spec amendment)
Decision: keep clamping at min size when dragging past the opposite edge (no flip). Rationale: simpler state machine, no binding re-orientation edge cases, matches Draw.io. Spec-13 FR-B2's "flips normally" sentence is superseded by this FR. Tests named "flip" are renamed to describe clamping.

### FR-B7: Resize handles meet 12 px pointer targets
Handles keep their 8 px visual size but gain a ≥12 screen px effective hit area (transparent hit ring/rect per handle, zoom-compensated like element hit-targets).

### FR-B8: Group operations are O(n) per frame
New store action `updateElements(patches: Array<{ id, patch }>)` applies all patches in ONE array copy and runs connector recompute once per affected shape set. Group move (pointermove), arrow-key nudge, and `applyStyle` use it. Behavior identical; per-frame cost no longer O(k·n) array copies.

### Part C — Test coverage + hygiene (compliance)

### FR-C1: Close the scenario-coverage gaps
New behavior-named tests for implemented-but-untested behavior:
- Toolbar shows "Save failed — retrying" when `saveError` set.
- Exactly one toast per save-failure episode (DiagramsView watcher; second consecutive failure → no second toast; recovery then new failure → new toast).
- Real `Ctrl+Z` / `Ctrl+Shift+Z` keydown path through `onKeyDown` (including uppercase-Z branch), guarded vs text input.
- Handles hidden for multi-selection (≥2 selected → no handle elements rendered); first `DiagramSelectionHandles` render tests (8 handles for single rect, endpoint handles for arrow, none for pen).
- Ctrl+wheel keeps the scene point under the cursor fixed (assert scene-point invariance, not just zoom change).
- Pen: >500 raw samples → ≤200 stored points (FR-A7 headline claim) and the 2-scene-px capture throttle.
- Style persistence: applyStyle → save payload carries the styled fields (assert PATCH body).
- New element adopts last-used style through the real canvas commit path (draw after applyStyle → element carries the style).
- Legacy center-anchored bound scene loads and renders unchanged until a bound shape next moves.

### FR-C2: Test hygiene
- Remove dead `storeState.error = null` writes in `DiagramSelection.spec.ts`, `DiagramTools.spec.ts`, `DiagramConnectors.spec.ts` (field removed in ICT-2) — use the real channel fields where a reset is needed.
- Scope the `SVGElement.prototype.setPointerCapture` patch in `DiagramConnectors.spec.ts` to beforeEach/afterEach with restore.
- Unmount `attachTo: document.body` wrappers in afterEach where window listeners accumulate.

### FR-C3: Decompose DiagramCanvas.vue
Split the 683-line script by extracting the pointer state machine into composables (e.g. `useCanvasPointer.ts` orchestrating pan/draw/move/resize/marquee branches, `useCanvasKeyboard.ts` for onKeyDown) so DiagramCanvas.vue's script drops under ~300 lines and no extracted function exceeds 40 lines. Pure refactor: zero behavior change, all existing tests pass unmodified (test file imports may update paths only). `onCanvasPointerMove`/`onCanvasPointerUp`/`onKeyDown`/`handleSelectPointerDown`/`applyStyle`/`resolveLinearEndpoints` each end ≤40 lines after extraction. Rename `useMarquee`'s `active` → `isActive`. Drop the unused `event` param in `onCanvasPointerLeave`.

## Technical requirements

### Architecture
- All changes in `apps/web/src/features/diagrams/` + `apps/web/src/stores/diagrams.ts`. New composables live beside existing ones. `findShapeAtScenePoint` is a pure function in `connectors.ts` (unit-testable, no DOM).
- No new dependencies.

### Data model
None. No schema or persistence changes (NaN guard prevents bad writes; schema untouched).

### API contracts
Unchanged.

### UI structure
- `DiagramSelectionHandles.vue`: + transparent hit areas per handle; pointer capture on handle drag.
- `DiagramToolbar.vue` / `DiagramsView.vue`: error toast on exportPng rejection.
- `DiagramCanvas.vue`: slimmed per FR-C3.

## Non-functional requirements

### Performance
- Group move/nudge/style of k selected elements among n total: one array copy per frame (FR-B8), connector recompute once per frame.

### Accessibility
- Handle hit targets ≥12 screen px (FR-B7). No other a11y changes; existing aria patterns preserved.

### Compatibility
- Zero behavior change from FR-C3 refactor; FR-B6 codifies current behavior. Persisted scenes unaffected.

## Dependencies

- spec-13 implementation (commits `f21fb12..6bb6249`) — shipped. Review findings doc: session review of 2026-06-10.

## Constraints

- No API/schema changes; additive frontend only.
- Existing 344 web + 281 api tests stay green (except tests explicitly corrected: tautological newBindings test, single-end re-anchor test, "flip"-named resize tests, dead-field hygiene).
- Bug fixes (Part A/B) land before the FR-C3 refactor — refactor moves settled code.
- One logical change per commit.

## Open questions

None blocking. FR-B6 records the clamp-over-flip decision as an amendment; flag during review if flip is preferred after all.

## Glossary

- **Gesture entry** — single undo-stack snapshot covering one pointerdown→pointerup interaction.
- **Episode** — one save-failure period from first failure to next success (one toast).
- **Geometric hit-test** — point-in-shape math against the element model, no DOM `elementFromPoint`.
