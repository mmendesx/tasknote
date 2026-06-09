// ── Edge-anchored connector geometry ─────────────────────────────────────────
// Pure functions for computing the point at which a connector ray intersects
// a shape boundary, stepped back by a small gap so arrowheads are always
// visible outside the shape.

const DEFAULT_GAP = 4

// ── Rectangle ────────────────────────────────────────────────────────────────

/**
 * Returns the intersection of the ray from `from` toward the rect center with
 * the rect boundary, then steps back `gap` scene px outward along that ray.
 * Edge case: if `from` equals the center (or is numerically indistinguishable),
 * the center itself is returned unchanged.
 */
export function rectEdgePoint(
  rect: { x: number; y: number; width: number; height: number },
  from: { x: number; y: number },
  gap = DEFAULT_GAP,
): { x: number; y: number } {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2

  const dx = cx - from.x
  const dy = cy - from.y

  // from is at the center — nothing to intersect
  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  const hw = rect.width / 2
  const hh = rect.height / 2

  // Parameter t where the ray P(t) = from + t*(center-from) hits each edge.
  // We want the t in [0,1] that places P on the rect border closest to `from`.
  // For the ray to reach the border we want the MINIMUM positive t.

  let tMin = Infinity

  // Right edge: cx + hw   → t = (cx + hw - from.x) / dx  (only if dx != 0)
  if (dx !== 0) {
    const t = (cx + hw - from.x) / dx
    if (t > 0 && t < tMin) {
      const y = from.y + t * dy
      if (y >= cy - hh && y <= cy + hh) tMin = t
    }
  }
  // Left edge: cx - hw
  if (dx !== 0) {
    const t = (cx - hw - from.x) / dx
    if (t > 0 && t < tMin) {
      const y = from.y + t * dy
      if (y >= cy - hh && y <= cy + hh) tMin = t
    }
  }
  // Bottom edge: cy + hh
  if (dy !== 0) {
    const t = (cy + hh - from.y) / dy
    if (t > 0 && t < tMin) {
      const x = from.x + t * dx
      if (x >= cx - hw && x <= cx + hw) tMin = t
    }
  }
  // Top edge: cy - hh
  if (dy !== 0) {
    const t = (cy - hh - from.y) / dy
    if (t > 0 && t < tMin) {
      const x = from.x + t * dx
      if (x >= cx - hw && x <= cx + hw) tMin = t
    }
  }

  if (!isFinite(tMin)) return { x: cx, y: cy }

  // Step back `gap` px along the ray outward from the shape (away from center).
  const len = Math.hypot(dx, dy)
  const gapT = gap / len

  const boundaryT = tMin - gapT

  return {
    x: from.x + boundaryT * dx,
    y: from.y + boundaryT * dy,
  }
}

// ── Ellipse ───────────────────────────────────────────────────────────────────

/**
 * Returns the intersection of the ray from `from` toward the ellipse center
 * with the ellipse perimeter, then steps back `gap` scene px outward.
 * Edge case: if `from` equals the center, the center is returned unchanged.
 *
 * The bbox parameter uses top-left origin (same as DiagramElement: x,y,width,height).
 */
export function ellipseEdgePoint(
  ellipse: { x: number; y: number; width: number; height: number },
  from: { x: number; y: number },
  gap = DEFAULT_GAP,
): { x: number; y: number } {
  const cx = ellipse.x + ellipse.width / 2
  const cy = ellipse.y + ellipse.height / 2
  const rx = ellipse.width / 2
  const ry = ellipse.height / 2

  const dx = cx - from.x
  const dy = cy - from.y

  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  // Parametric ray: P(t) = from + t * (center - from)
  // At t=0 we are at `from`, at t=1 we are at `center`.
  // Substitute into ellipse equation: ((px-cx)/rx)^2 + ((py-cy)/ry)^2 = 1
  // px - cx = from.x + t*dx - cx = (from.x - cx) + t*dx = -dx*(1-t)... wait,
  // let's be explicit:
  //   px = from.x + t*dx   →  px - cx = from.x - cx + t*dx  = -dx + t*dx  = dx*(t-1)
  //   py = from.y + t*dy   →  py - cy = dy*(t-1)
  //
  // ((dx*(t-1))/rx)^2 + ((dy*(t-1))/ry)^2 = 1
  // (t-1)^2 * [ (dx/rx)^2 + (dy/ry)^2 ] = 1
  // (t-1)^2 = 1 / [ (dx/rx)^2 + (dy/ry)^2 ]
  // |t-1| = 1 / sqrt(...)
  // t = 1 ± 1/sqrt(...)

  const denom = (dx / rx) * (dx / rx) + (dy / ry) * (dy / ry)
  if (denom === 0) return { x: cx, y: cy }

  const inv = 1 / Math.sqrt(denom)

  // Two solutions: t = 1 - inv  and  t = 1 + inv
  // We want the intersection between `from` and `center`, i.e. t in (0, 1].
  // Since inv > 0: 1 - inv is closest to `from` side when it's positive,
  // 1 + inv is always > 1 (outside the center). So pick t = 1 - inv.
  const t = 1 - inv

  if (t <= 0) {
    // `from` is inside the ellipse (or exactly on the perimeter).
    // Fall back to the other intersection.
    const tOther = 1 + inv
    // Step back from tOther toward `from` direction
    const len = Math.hypot(dx, dy)
    const gapT = gap / len
    const edgeT = tOther - gapT
    return {
      x: from.x + edgeT * dx,
      y: from.y + edgeT * dy,
    }
  }

  const len = Math.hypot(dx, dy)
  const gapT = gap / len
  const edgeT = t - gapT

  return {
    x: from.x + edgeT * dx,
    y: from.y + edgeT * dy,
  }
}
