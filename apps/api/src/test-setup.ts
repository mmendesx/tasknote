import 'reflect-metadata';
import { DataSource, getMetadataArgsStorage } from 'typeorm';

// ============================================================================
// Background
// ============================================================================
// vite-node evaluates entity modules more than once due to circular import
// chains (board ↔ column ↔ task ↔ tag/note). TypeORM's MetadataArgsStorage is
// a global singleton. Two problems compound:
//
//   A. Cross-spec accumulation: Vitest re-evaluates entities per test file
//      (isolated module registries). Each run adds new class objects to the
//      same global storage, creating stale/orphan registrations.
//
//   B. Within-spec circular duplication: some entities (ColumnEntity,
//      BoardEntity) are evaluated twice in a single import chain, producing two
//      class objects. The relation lambda `() => ColumnEntity` captures the
//      first (stale) object; the test passes the second (canonical) object to
//      DataSource.entities. TypeORM's reference-equality lookup fails.
//
//   C. Service-side stale references: service files capture entity class
//      references earlier in the circular chain than test files.
//      manager.createQueryBuilder(BoardEntity_stale, ...) calls
//      findMetadata(BoardEntity_stale) which fails the strict equality lookup.
//
// ── Fix A: module-level storage reset ────────────────────────────────────────
// Clear global storage at setupFile module-evaluation time. This runs before
// each test file's imports, so only this file's entity evaluations populate it.
//
// ── Fix B: beforeEach storage reconciliation ─────────────────────────────────
// After the test file's module code runs (registering entities possibly twice),
// and before each test's beforeEach (which initializes DataSource), reconcile:
// - identify the canonical class for each entity name (last registration wins)
// - remove stale (earlier) registrations
// - wrap relation-type lambdas to return canonical classes
//
// ── Fix C: name-based fallback in DataSource.findMetadata ────────────────────
// Patch DataSource.prototype.findMetadata to fall back to name-based lookup
// when strict reference equality fails. Handles stale class refs from services.
// ============================================================================

// ── Fix A ────────────────────────────────────────────────────────────────────
(globalThis as Record<string, unknown>)['typeormMetadataArgsStorage'] = undefined;

// ── Fix B ────────────────────────────────────────────────────────────────────
const STORAGE_ARRAYS = [
  'tables', 'trees', 'entityRepositories', 'transactionEntityManagers',
  'namingStrategies', 'entityListeners', 'entitySubscribers',
  'indices', 'checks', 'exclusions', 'uniques', 'columns',
  'discrimValues', 'relations', 'joinColumns', 'joinTables',
  'relationCounts', 'relationIds', 'entityInheritances',
] as const;

function reconcileTypeOrmStorage(): void {
  const storage = getMetadataArgsStorage();
  const raw = storage as unknown as Record<string, { target: unknown; propertyName?: unknown }[]>;

  // canonical: last registration wins (it's from the direct import path)
  const canonical = new Map<string, Function>();
  for (const table of storage.tables) {
    if (typeof table.target === 'function') {
      canonical.set((table.target as Function).name, table.target as Function);
    }
  }

  // remap: stale class → canonical class
  const remap = new Map<Function, Function>();
  for (const table of storage.tables) {
    const target = table.target as Function;
    if (typeof target !== 'function') continue;
    const canon = canonical.get(target.name);
    if (canon && canon !== target) remap.set(target, canon);
  }

  if (remap.size === 0) return;

  // Remove stale entries (entries whose target is a stale class reference).
  // The canonical class already has its own entries from its own evaluation.
  for (const arrayName of STORAGE_ARRAYS) {
    const arr = raw[arrayName];
    if (!Array.isArray(arr)) continue;
    raw[arrayName] = arr.filter(
      (entry) => !(typeof entry.target === 'function' && remap.has(entry.target as Function))
    );
  }

  // Wrap relation-type lambdas to return canonical class (idempotent)
  for (const relation of storage.relations) {
    if (typeof relation.type !== 'function') continue;
    const fn = relation.type as { __reconciled?: boolean; (): unknown };
    if (fn.__reconciled) continue;
    const wrapped: { __reconciled?: boolean; (): unknown } = () => {
      const resolved = fn();
      if (typeof resolved === 'function') {
        const canon = canonical.get((resolved as Function).name);
        if (canon && canon !== resolved) return canon;
      }
      return resolved;
    };
    wrapped.__reconciled = true;
    relation.type = wrapped;
  }
}

beforeEach(reconcileTypeOrmStorage);

// ── Fix C ────────────────────────────────────────────────────────────────────
type AnyEntityMetadata = { name: string; tableName: string };
type AnyMap = Map<unknown, AnyEntityMetadata>;

const _origFindMetadata = (
  DataSource.prototype as unknown as { findMetadata(t: unknown): unknown }
).findMetadata;

if (!(_origFindMetadata as { __patched?: boolean }).__patched) {
  const patched = function patchedFindMetadata(
    this: unknown,
    target: unknown
  ): unknown {
    const hit = _origFindMetadata.call(this, target);
    if (hit) return hit;

    if (typeof target === 'function') {
      const name = (target as { name: string }).name;
      if (name) {
        const map = (this as { entityMetadatasMap?: AnyMap }).entityMetadatasMap;
        if (map) {
          for (const [, meta] of map) {
            if (meta.name === name || meta.tableName === name) return meta;
          }
        }
      }
    }
    return undefined;
  };
  (patched as { __patched?: boolean }).__patched = true;
  (DataSource.prototype as unknown as { findMetadata(t: unknown): unknown }).findMetadata = patched;
}
