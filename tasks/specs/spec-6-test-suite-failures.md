# spec-6 — Fix 3 pre-existing API test failures

**Source**: 3 long-standing failing tests in the API suite, surfaced repeatedly during spec-4/5 verification. NFR-1 ("all existing tests pass") is unmet on the branch because of them. Two are test-harness defects; one is a **real production data-integrity bug**.

After spec-5, API suite = 217 pass / 3 fail. Goal: 220/220.

---

## The three failures (verified failure messages)

1. `FileRefsService › openFile › invokes spawn with the correct platform binary and no shell option`
   → `Cannot redefine property: spawn`
2. `SettingsService › onboard() › sets onboarded_at and returns updated settings when seed=empty`
   → `expected undefined to be null`
3. `TagsService › removeTag › cascade removes task_tags rows when tag is deleted`
   → `SqliteError: FOREIGN KEY constraint failed`

---

## Goals

1. Make `openFile` spy-able under the SWC/ESM test transform without weakening production code.
2. Fix the `default_board_id` null-vs-undefined mismatch in the empty-seed onboarding path (decide: bug in service mapping or in the test mock).
3. **Fix the real bug**: deleting a tag that is linked to tasks throws a FK violation instead of removing the `task_tags` join rows first.

Out of scope:
- The 2 unrelated test-infra items already tracked separately (BoardEntity metadata — already resolved in spec-4 follow-up).
- Any feature change to tags/settings/file-refs beyond what these fixes require.

---

## Functional requirements

### FR-1 — `removeTag` cascades to `task_tags` (PRODUCTION BUG)

- `apps/api/src/modules/tags/tags.service.ts` `removeTag(id)` MUST delete dependent `task_tags` join rows before (or atomically with) deleting the tag, so no FK constraint can fire.
- Preferred: do it in a transaction — delete `task_tags WHERE tag_id = :id`, then delete the tag. OR rely on a DB-level `ON DELETE CASCADE` on the `task_tags.tag_id` FK if the schema/migration supports adding it. Pick the transaction approach unless the join-table FK already declares cascade (it evidently does not, since the test fails).
- After fix: removing a tag linked to N tasks succeeds; those tasks show 0 tags; no orphan `task_tags` rows remain.
- This is the same class of cascade the boards/file-refs path already handles — match that pattern.

### FR-2 — `openFile` is testable under SWC transform (TEST INFRA)

- The test does `vi.spyOn(childProcess, 'spawn')` and gets `Cannot redefine property: spawn` because the SWC/ESM-transformed `child_process` namespace export is non-configurable.
- Fix WITHOUT changing `openFile`'s runtime behavior (still uses `spawn`, detached, `unref()`, no shell, correct per-platform opener). Options, pick the cleanest:
  - (a) In the spec, replace `vi.spyOn(childProcess, 'spawn')` with `vi.mock('child_process', ...)` factory returning a mockable `spawn`.
  - (b) Import spawn via a thin indirection the service already controls (e.g. `import * as childProcess` → call `childProcess.spawn` is current; expose a protected `spawnFn` seam) — only if (a) is insufficient.
- Prefer (a): test-only change, zero production diff. The assertion contract (correct binary per platform, no `shell`, detached+unref) MUST stay intact.

### FR-3 — Onboard empty-seed `default_board_id` is null, not undefined (TEST/MAPPING)

- `SettingsService.onboard({ seed: 'empty' })` result MUST have `default_board_id === null` (not `undefined`).
- Investigate: is the service returning `undefined` (should map to `null` in the response shape) or is the test's `makeRepoMock(null)` fixture wrong? Fix at the correct layer:
  - If the API contract says `default_board_id: number | null`, the service MUST normalize `undefined → null` before returning.
  - If only the mock is wrong, fix the mock.
- Decide based on what the controller actually serializes — the wire response must be `null`, consistent with the `seed: 'sample'` path which sets a real id.

---

## Non-functional requirements

- **NFR-1** After fixes: full API suite 220/220 (0 failures). `npx vitest run` clean.
- **NFR-2** `pnpm --filter @tasknote/api build` passes.
- **NFR-3** No production behavior change for `openFile` (FR-2 is test-only). FR-1 changes `removeTag` behavior (the fix). FR-3 changes at most the null-normalization.
- **NFR-4** No new runtime dependencies.
- **NFR-5** FR-1 fix covered by the existing cascade test (now passing) plus an assertion that no orphan `task_tags` rows remain.

---

## Dependencies

- FR-1 may touch the tags migration only if choosing the DB-cascade route; the transaction route needs no migration.
- All three are isolated to their own module + spec.

## Open questions

None blocking. FR-1 = transaction-based cascade (no migration) unless the join FK trivially supports `ON DELETE CASCADE`.
