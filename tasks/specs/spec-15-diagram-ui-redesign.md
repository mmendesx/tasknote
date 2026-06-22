# Spec: Diagram canvas & components UI/UX redesign

## Overview
Full visual and UX redesign of the diagrams feature — canvas, toolbar, style panel, selection chrome, zoom controls, list view — toward a professional, minimalist aesthetic (reference class: Excalidraw/tldraw/Linear polish). Interaction logic, store, geometry, export, and persistence are already solid and well-tested; this is a presentation-layer redesign that preserves behavior.

## Actors
- End user creating/editing diagrams (mouse, trackpad, keyboard)
- Existing automated test suite (16 spec files) that must keep passing

## Functional requirements

### FR-1: Floating tool palette
Replace the top toolbar tool buttons with a floating, pill-shaped tool palette (horizontal, top-center of canvas, or vertical left — pick one and apply consistently). Tools: Select, Hand, Rectangle, Ellipse, Line, Arrow, Text, Pen. Each button: consistent 20px icon set, tooltip with name + shortcut (e.g. "Rectangle — R"), clear active state (filled accent background, not just border). Keyboard shortcuts unchanged.

### FR-2: Floating zoom & history cluster
Zoom controls (out, percentage/reset, in) and undo/redo move into a compact floating cluster pinned bottom-left of canvas. Percentage label is a button resetting to 100%. Undo/redo disabled states visually muted, not hidden.

### FR-3: Contextual floating style panel
Style panel becomes a floating card anchored top-right (or near selection) that appears only when ≥1 element selected, with a subtle enter/exit transition (respect `prefers-reduced-motion`). Redesign controls:
- Stroke color: row of circular swatches, active ring indicator
- Fill: same pattern incl. "none" swatch (diagonal slash)
- Stroke width: three visual line-weight previews instead of text labels
- Font size: S/M/L segmented control
Mixed-selection states show indeterminate (no active swatch).

### FR-4: Refined selection chrome
- Selection outline: solid 1px accent line (replace dashed) with slight padding around element bbox
- Resize handles: small squares (≈8px screen-space, zoom-invariant), white fill, accent border, subtle shadow
- Marquee: accent-tinted translucent fill + 1px accent border
- Hover affordance: light accent outline on hoverable elements under Select tool

### FR-5: Canvas background & surface
Add subtle dot-grid background (theme-aware, low contrast, pans/zooms with viewport, fades out below ~40% zoom). Canvas surface uses `--color-bg`; floating chrome uses `--color-surface-elevated` with consistent border, radius (`--radius-card`), and soft shadow.

### FR-6: Top bar simplification
DiagramsView top bar keeps: diagram title (inline-rename), save status indicator (redesigned as compact dot + label: muted "Saved", accent pulse "Saving…", warning "Save failed"), export menu (SVG/PNG consolidated into one dropdown), back/list navigation. Remove anything duplicated by floating clusters.

### FR-7: Diagram list redesign
DiagramList becomes a minimalist card grid: each card shows title, relative updated time, hover state with quiet delete action. Empty state: centered icon + one-line prompt + create button.

### FR-8: Behavior preservation
All existing interactions unchanged: tool shortcuts, marquee, multi-select, resize, text editing, pan/zoom, undo/redo, autosave, export output. Existing tests updated only where they assert on markup/classes, not behavior.

## Technical requirements

### Architecture
Presentation-only changes in `apps/web/src/features/diagrams/*.vue`. Composables (`useCanvasPointer`, `useDrawTools`, `useResize`, etc.), `stores/diagrams.ts`, geometry, and export modules untouched except where a prop/class hook is needed. New shared icon set as inline SVG components or a small `icons.ts` map within the feature.

### Data model
None. No backend changes.

### API contracts
None.

### UI structure
- `DiagramToolbar.vue` → split: `DiagramToolPalette.vue` (floating tools) + `DiagramZoomCluster.vue` (zoom/undo/redo); export + save status move to `DiagramsView` top bar
- `DiagramStylePanel.vue` → redesigned floating card
- `DiagramSelectionHandles.vue` / `DiagramCanvas.vue` → selection chrome + dot-grid layer (SVG `<pattern>`)
- `DiagramList.vue` → card grid + empty state
- All colors/spacing/radius/motion from `packages/ui/src/tokens/tokens.css` vars — zero hardcoded hex; dark/light both verified

### Infrastructure
None.

## Non-functional requirements
- **Performance**: dot-grid via SVG pattern (no per-dot nodes); no regressions to pan/zoom frame rate; floating panels must not trigger canvas re-render
- **Accessibility**: all controls keyboard-reachable, ARIA labels preserved, `.focus-ring` on interactive chrome, `prefers-reduced-motion` honored, color swatches have accessible names
- **Compatibility**: dark + light theme; existing keyboard shortcuts unchanged

## Dependencies
- `@tasknote/ui` primitives (Button, DropdownMenu, Tooltip) — available
- tokens.css — available

## Constraints
- No new runtime dependencies (no icon library — hand-rolled SVG icons)
- No store/composable behavior changes; no schema/API changes
- Existing test suite must pass (markup-level assertions may be updated)

## Open questions
- Tool palette orientation: top-center horizontal vs left vertical. Assumption: **top-center horizontal** (matches Excalidraw convention, preserves horizontal canvas space). Correct if undesired.
- Dot-grid: assumption **on by default, no toggle** in this pass; toggle deferred.
