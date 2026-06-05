# PRD: Diagram Connectors (binding arrows)

**Spec**: tasks/specs/spec-12-diagram-connectors.md

## Summary
Add binding to diagram arrows: an arrow endpoint drawn onto a shape binds to it and
anchors to that shape's center; moving the shape re-routes the connector live and
autosaves the new geometry; deleting a shape detaches its connectors in place. Pure
frontend + an additive `scene_json` schema change — no backend/DB migration.

## Behavior scenarios

### Feature: Creating bindings

#### Scenario: Draw an arrow from one shape to another binds both ends
  Given a rectangle R and an ellipse E on the canvas and the Arrow tool active
  When the user draws an arrow starting over R and ending over E
  Then the new arrow's startBinding references R and endBinding references E
  And each endpoint sits at the center of its bound shape

#### Scenario: An endpoint released on empty canvas stays free
  Given a rectangle R and the Arrow tool active
  When the user draws an arrow starting over R and ending on empty canvas
  Then startBinding references R and endBinding is null
  And the end endpoint is at the pointer position where it was released

#### Scenario: Arrow with both ends on the same shape is allowed
  Given a rectangle R and the Arrow tool active
  When the user draws an arrow that starts and ends over R
  Then both startBinding and endBinding reference R

#### Scenario: Free arrow (no shapes) is unaffected
  Given empty canvas and the Arrow tool active
  When the user draws an arrow on empty space
  Then startBinding and endBinding are both null and it renders as a normal arrow

### Feature: Re-routing on move

#### Scenario: Moving a bound shape re-routes its connector
  Given an arrow whose startBinding references rectangle R, R centered at (100,100)
  When the user drags R so its center becomes (180,140)
  Then the arrow's start point becomes (180,140)
  And the change persists via the debounced autosave (one PATCH after the window)

#### Scenario: Moving the other bound shape re-routes the other end
  Given an arrow bound start→R and end→E
  When the user moves E
  Then only the arrow's end point updates to E's new center; the start point stays at R's center

#### Scenario: Moving an unrelated shape does not touch the connector
  Given an arrow bound to R and an unrelated rectangle U
  When the user moves U
  Then the arrow's points are unchanged

### Feature: Delete detaches in place

#### Scenario: Deleting a bound shape detaches its connector
  Given an arrow with startBinding → rectangle R at last points [[100,100],[300,300]]
  When the user deletes R
  Then the arrow remains on the canvas with points still [[100,100],[300,300]]
  And its startBinding is now null

#### Scenario: Deleting a shape does not delete connectors bound to it
  Given two arrows both bound to rectangle R
  When the user deletes R
  Then both arrows still exist (now free), and only R is removed

### Feature: Persistence

#### Scenario: Bindings round-trip through save and reload
  Given an arrow bound start→R, end→E, saved to the backend
  When the user reopens the diagram
  Then the arrow still reports startBinding R and endBinding E
  And moving R after reload re-routes the arrow's start point

#### Scenario: Old arrows without binding fields still load
  Given a stored scene whose arrow has no startBinding/endBinding keys
  When the diagram is loaded and validated
  Then it loads without error and the arrow is treated as free (both bindings null)

## Tasks

### ICT-1: Binding schema in shared
- **What**: Extend the `line` and `arrow` variants of `DiagramElementSchema` (dtos.ts) with optional `startBinding`/`endBinding`: `z.object({ elementId: z.string() }).nullable().optional()`. Export a `DiagramBinding` type. Verify old elements (no binding keys) still parse and a binding with a string elementId parses; a malformed binding (elementId missing) fails. Build the package.
- **What (tests)**: Schema unit assertions (in the package's existing test path if present, else reason via build) — arrow with bindings parses, arrow without parses, `{ startBinding: { } }` (no elementId) fails.
- **Where**: `packages/shared/src/dtos.ts`
- **Validated by**: Old arrows without binding fields still load; (schema-level) Draw an arrow from one shape to another binds both ends
- **Estimate**: S

### ICT-2: Center + binding-resolution helpers
- **What**: `elementCenter(el)` → `{ x, y }` using `computeElementBbox` (center = x+w/2, y+h/2) in `useSelection.ts` (or a small `connectors.ts`). A `resolveBindingAt(point/eventTarget)` helper that returns the shape id under a draw endpoint by reusing the existing hit-test (`closest('[data-element-id]')` → element; only rectangle/ellipse are bindable — ignore non-shape hits).
- **What (tests)**: vitest — `elementCenter` returns correct center for rect/ellipse; resolveBinding returns the shape id when over a shape and null on empty/over a non-shape.
- **Where**: `apps/web/src/features/diagrams/useSelection.ts` (or new `connectors.ts`), `apps/web/src/features/diagrams/__tests__/`
- **Validated by**: Bound endpoints anchor to shape center (helper level)
- **Estimate**: S

### ICT-3: Bind on draw (arrow tool)
- **What**: In `DiagramCanvas.vue` arrow draw path: resolve the shape under the start point AND under the end point. **CRITICAL — use `document.elementFromPoint(clientX, clientY)` for BOTH endpoints, NOT `event.target`/`hitElementId`.** `handleDrawPointerDown` calls `capturePointer`, so during the drag the pointer is captured to the SVG; on pointerup `event.target` is the SVG (not the shape under the release point) and `closest('[data-element-id]')` returns null → `endBinding` would always be null. `document.elementFromPoint` returns the real node at the release coordinates; walk it with `closest('[data-element-id]')` and keep only rectangle/ellipse hits. Pass resulting bindings into the arrow build. Extend `buildLinearElement` (useDrawTools.ts) for the arrow case to accept/attach `startBinding`/`endBinding`; when an endpoint is bound, set that endpoint's point to the bound shape's center (via `elementCenter`); free endpoints keep the drawn point. Lines remain unbound (no UI).
- **Same-shape (FR-4) decision**: a bound arrow is **exempt from the `MIN_DRAG_PX` zero-length guard** — when at least one endpoint is bound, `buildLinearElement` must NOT return null even if the two points coincide (both ends on the same shape → both at its center → zero length, but still a valid connector). Only fully-free arrows keep the zero-length guard.
- **What (tests)**: vitest — MUST reproduce the captured path: stub `setPointerCapture`, dispatch pointermove/pointerup on the **SVG** (not the target shape), and use `document.elementFromPoint` (or seed elements so it resolves) so a test that passes proves the real captured flow. Cases: start-over-R end-over-E yields startBinding R + endBinding E with points at centers; start-over-R end-on-empty yields startBinding R, endBinding null, end point = released point; both-on-R yields both bindings R AND an arrow IS created (zero-length exemption); empty→empty yields both null and the zero-length guard still applies.
- **Where**: `apps/web/src/features/diagrams/DiagramCanvas.vue`, `useDrawTools.ts`, `__tests__/`
- **Validated by**: Draw an arrow from one shape to another binds both ends; An endpoint released on empty canvas stays free; Arrow with both ends on the same shape is allowed; Free arrow is unaffected
- **Estimate**: M

### ICT-4: Re-route bound connectors on move
- **What**: In the store (`stores/diagrams.ts`), add `recomputeBoundConnectors(movedElementId)` and call it inside the move path so that after a shape's geometry patch is applied, every arrow whose startBinding/endBinding references the moved shape has the corresponding endpoint(s) recomputed to the shape's new center, updating that arrow's `points`. Runs live per move frame (reuses existing debounced autosave to persist). Only arrows bound to the moved id are touched.
- **What (tests)**: vitest (mocked api, fake timers) — moving R updates the bound start point to R's new center; moving E updates only the end; moving an unrelated shape leaves the connector unchanged; recompute persists via a single debounced PATCH.
- **Where**: `apps/web/src/features/diagrams/DiagramCanvas.vue` (move handler call site), `apps/web/src/stores/diagrams.ts`, `stores/__tests__/diagrams.spec.ts`
- **Validated by**: Moving a bound shape re-routes its connector; Moving the other bound shape re-routes the other end; Moving an unrelated shape does not touch the connector
- **Estimate**: M

### ICT-5: Detach connectors on shape delete
- **What**: In the store's `removeElement`, after removing the shape, clear any `startBinding`/`endBinding` on remaining arrows that reference the removed id (set to null), leaving each arrow's `points` untouched. Connectors are not deleted. Schedule autosave.
- **What (tests)**: vitest — deleting R bound to one arrow nulls that arrow's binding and keeps its points; deleting R bound to two arrows leaves both arrows present (free) and removes only R.
- **Where**: `apps/web/src/stores/diagrams.ts`, `stores/__tests__/diagrams.spec.ts`
- **Validated by**: Deleting a bound shape detaches its connector; Deleting a shape does not delete connectors bound to it
- **Estimate**: S

### ICT-6: Persistence round-trip verification
- **What**: Ensure bindings flow through `save()`/`loadDiagram` (they ride inside `scene_json.elements`, so this is largely verification + a regression test). Confirm reopen restores bindings and a post-reload shape move re-routes. Confirm a legacy scene (arrow with no binding keys) loads and is treated as free.
- **What (tests)**: vitest (mocked api) — a scene with a bound arrow hydrates with bindings intact; a legacy arrow (no binding keys) hydrates without error and behaves as free; (integration/browser, manual per skill) draw a connector, move a shape, reload, move again → connector still follows.
- **Where**: `apps/web/src/stores/__tests__/diagrams.spec.ts`, manual browser verification
- **Validated by**: Bindings round-trip through save and reload; Old arrows without binding fields still load
- **Estimate**: S

## Open questions
None — all binding-schema, anchor (center), move-coupling, delete-detach, and non-goal
decisions were settled before specification.

## Dependencies
- spec-11 diagram canvas (move path, hit-test, autosave, `computeElementBbox`). **available**
- `@tasknote/shared` `DiagramElementSchema` (extended in ICT-1; gates ICT-3–6). **available**
- No backend change — `scene_json` is an opaque blob validated by the shared schema.
