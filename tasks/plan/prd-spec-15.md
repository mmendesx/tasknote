# PRD: Diagram canvas & components UI/UX redesign

**Spec**: tasks/specs/spec-15-diagram-ui-redesign.md

## Summary
Presentation-layer redesign of the diagrams feature toward a professional, minimalist aesthetic: floating tool palette, floating zoom/history cluster, contextual floating style panel, refined selection chrome, dot-grid canvas, simplified top bar, and a redesigned diagram list. All interaction logic, stores, geometry, export, and persistence behavior are preserved; existing tests keep passing (markup-level assertions may be updated).

## Behavior scenarios

### Feature: Tool palette

#### Scenario: Palette shows all tools with active state
  Given an open diagram
  When the canvas renders
  Then a floating top-center palette shows 8 tool buttons (Select, Hand, Rectangle, Ellipse, Line, Arrow, Text, Pen)
  And the active tool button has a filled accent background

#### Scenario: Tooltip reveals name and shortcut
  Given the tool palette is visible
  When the user hovers the Rectangle button
  Then a tooltip shows "Rectangle — R"

#### Scenario: Keyboard shortcuts still switch tools
  Given the Select tool is active
  When the user presses "R"
  Then the Rectangle tool becomes active and its palette button shows the active state

### Feature: Zoom & history cluster

#### Scenario: Cluster shows zoom and history controls
  Given an open diagram
  When the canvas renders
  Then a floating bottom-left cluster shows zoom-out, zoom percentage, zoom-in, undo, and redo controls

#### Scenario: Percentage button resets zoom
  Given the viewport zoom is 150%
  When the user clicks the "150%" button
  Then the zoom returns to 100%

#### Scenario: Undo disabled when history empty
  Given a freshly loaded diagram with no edits
  When the cluster renders
  Then the undo button is disabled and visually muted but still present

### Feature: Floating style panel

#### Scenario: Panel appears on selection
  Given no element is selected
  When the user selects a rectangle
  Then a floating style card appears anchored top-right with stroke swatches, fill swatches, stroke-width previews, and no font-size control

#### Scenario: Panel hides when selection clears
  Given the style panel is visible
  When the user clicks empty canvas
  Then the style panel is removed from the view

#### Scenario: Active swatch shows ring indicator
  Given a selected rectangle with red stroke
  When the panel renders
  Then the red stroke swatch shows an active ring and no other stroke swatch does

#### Scenario: Mixed selection shows indeterminate state
  Given two selected rectangles with different stroke colors
  When the panel renders
  Then no stroke swatch shows an active ring

#### Scenario: Stroke width shown as line-weight previews
  Given a selected element
  When the panel renders
  Then the stroke-width control shows three line-weight previews instead of text labels

#### Scenario: Reduced motion disables panel transition
  Given the OS reports prefers-reduced-motion
  When the style panel appears
  Then it appears without enter animation

### Feature: Selection chrome

#### Scenario: Solid selection outline
  Given a rectangle on the canvas
  When the user selects it
  Then the selection outline is a solid 1px accent line with padding around the bounding box

#### Scenario: Square zoom-invariant handles
  Given a selected rectangle at 200% zoom
  When the handles render
  Then 8 square handles render at ~8px screen size regardless of zoom

#### Scenario: Marquee styling
  Given the Select tool is active
  When the user drags on empty canvas
  Then the marquee renders an accent-tinted translucent fill with a 1px accent border

#### Scenario: Hover affordance
  Given the Select tool is active
  When the pointer hovers an element
  Then the element shows a light accent outline

### Feature: Canvas surface

#### Scenario: Dot grid renders and tracks viewport
  Given an open diagram
  When the user pans the canvas
  Then the dot-grid background moves with the viewport

#### Scenario: Dot grid fades at low zoom
  Given the viewport zoom is 30%
  When the canvas renders
  Then the dot grid is not visible

#### Scenario: Dot grid adapts to theme
  Given the app is in light mode
  When the canvas renders
  Then the dot grid uses a low-contrast light-theme color (token-derived, no hardcoded hex)

### Feature: Top bar

#### Scenario: Consolidated export menu
  Given an open diagram with elements
  When the user opens the export dropdown in the top bar
  Then "Export SVG" and "Export PNG" options are listed and trigger the existing exports

#### Scenario: Export disabled when empty
  Given an open diagram with no elements
  When the top bar renders
  Then the export menu trigger is disabled

#### Scenario: Save status indicator states
  Given the user edits an element
  When the autosave cycle runs
  Then the indicator shows "Saving…" with an accent pulse, then "Saved" muted
  And on save failure it shows a warning "Save failed" state

### Feature: Diagram list

#### Scenario: Card grid with metadata
  Given 3 existing diagrams
  When the list view renders
  Then 3 cards show title and relative updated time
  And hovering a card reveals a quiet delete action

#### Scenario: Empty state
  Given no diagrams exist
  When the list view renders
  Then a centered empty state shows an icon, a one-line prompt, and a create button

### Feature: Behavior preservation

#### Scenario: Full interaction regression
  Given the redesigned UI
  When the existing test suite runs
  Then all behavior tests pass (shortcuts, marquee, multi-select, resize, text edit, pan/zoom, undo/redo, autosave, export output)

## Tasks

### ICT-1: Icon set + floating-chrome shared styles
- **What**: Create consistent 20px inline-SVG icon set (8 tools, zoom in/out, undo, redo, export, delete, empty-state) as a feature-local `icons.ts`/components. Define shared floating-chrome styling (surface-elevated bg, border, `--radius-card`, soft shadow) as a reusable class/utility. Tokens only, no hardcoded hex.
- **Where**: `apps/web/src/features/diagrams/icons.ts` (new), `apps/web/src/styles/` or feature-local styles
- **Validated by**: Palette shows all tools with active state (visual foundation)
- **Estimate**: S

### ICT-2: DiagramToolPalette component
- **What**: New floating top-center pill palette replacing toolbar tool buttons. Active state = filled accent. Tooltips "Name — Shortcut" via @tasknote/ui Tooltip. Wire to existing tool state in store; shortcuts untouched.
- **Where**: `apps/web/src/features/diagrams/DiagramToolPalette.vue` (new), `DiagramCanvas.vue`/`DiagramsView.vue` mount point
- **Validated by**: Palette shows all tools; Tooltip reveals name and shortcut; Keyboard shortcuts still switch tools
- **Estimate**: M

### ICT-3: DiagramZoomCluster component
- **What**: Floating bottom-left cluster: zoom out, percentage (click → reset 100%), zoom in, undo, redo. Disabled states muted not hidden. Wire to existing store/history APIs.
- **Where**: `apps/web/src/features/diagrams/DiagramZoomCluster.vue` (new)
- **Validated by**: Cluster shows zoom and history controls; Percentage button resets zoom; Undo disabled when history empty
- **Estimate**: S

### ICT-4: Top bar — export menu + save indicator; retire DiagramToolbar
- **What**: Move export (SVG/PNG → single DropdownMenu) and save status (dot + label: muted Saved / accent pulse Saving… / warning Save failed) into DiagramsView top bar. Delete `DiagramToolbar.vue` once palette + cluster cover its duties. Update toolbar tests accordingly.
- **Where**: `apps/web/src/features/diagrams/DiagramsView.vue`, remove `DiagramToolbar.vue`, update `__tests__/DiagramToolbar.spec.ts` (split/migrate assertions to new components)
- **Validated by**: Consolidated export menu; Export disabled when empty; Save status indicator states
- **Estimate**: M

### ICT-5: Floating style panel redesign
- **What**: Rebuild `DiagramStylePanel.vue` as a floating top-right card: circular stroke/fill swatches with active ring + "none" slash swatch, line-weight previews for stroke width, S/M/L segmented font-size control, indeterminate mixed-selection state, enter/exit transition honoring `prefers-reduced-motion`.
- **Where**: `apps/web/src/features/diagrams/DiagramStylePanel.vue`, `__tests__/DiagramStylePanel.spec.ts`
- **Validated by**: Panel appears on selection; Panel hides when selection clears; Active swatch shows ring; Mixed selection indeterminate; Stroke width previews; Reduced motion
- **Estimate**: M

### ICT-6: Selection chrome refinement
- **What**: Solid 1px accent selection outline with bbox padding; square ~8px zoom-invariant handles (white fill, accent border, subtle shadow); accent-tinted marquee; hover outline under Select tool.
- **Where**: `apps/web/src/features/diagrams/DiagramSelectionHandles.vue`, `DiagramCanvas.vue`, `DiagramElementView.vue`, related specs
- **Validated by**: Solid selection outline; Square zoom-invariant handles; Marquee styling; Hover affordance
- **Estimate**: M

### ICT-7: Dot-grid canvas background
- **What**: SVG `<pattern>` dot grid layer in canvas, theme-aware via tokens, pans/zooms with viewport, fades out below ~40% zoom. No per-dot nodes; verify no pan/zoom perf regression.
- **Where**: `apps/web/src/features/diagrams/DiagramCanvas.vue`, `__tests__/DiagramCanvas.spec.ts`
- **Validated by**: Dot grid renders and tracks viewport; fades at low zoom; adapts to theme
- **Estimate**: S

### ICT-8: Diagram list redesign
- **What**: Card grid (title, relative updated time, hover-revealed quiet delete) + centered empty state (icon, prompt, create button).
- **Where**: `apps/web/src/features/diagrams/DiagramList.vue`, `__tests__/DiagramList.spec.ts`
- **Validated by**: Card grid with metadata; Empty state
- **Estimate**: M

### ICT-9: Full regression + theme/a11y pass
- **What**: Run full web test suite; update markup-only assertions broken by redesign. Manual verify dark + light themes, keyboard reachability, focus rings, ARIA labels on all new chrome, reduced motion. Typecheck + lint clean.
- **Where**: `apps/web/src/features/diagrams/__tests__/*`, whole feature
- **Validated by**: Full interaction regression (and all scenarios above)
- **Estimate**: M

## Open questions
- Tool palette orientation — assumed top-center horizontal (Excalidraw convention). Correct if vertical-left preferred.
- Dot grid — assumed always-on, no toggle this pass.

## Dependencies
- `@tasknote/ui` primitives (Button, DropdownMenu, Tooltip) — available
- `packages/ui/src/tokens/tokens.css` — available
- No backend/API/store changes
