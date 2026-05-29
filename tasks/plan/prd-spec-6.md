# PRD spec-6 — Fix 3 pre-existing API test failures

Source: `tasks/specs/spec-6-test-suite-failures.md`.

## BDD scenarios

### SCN-1 (FR-1) — Removing a linked tag cascades to task_tags
```
Given a task linked to tag "urgent" (one task_tags row exists)
When TagsService.removeTag(tagId) runs
Then the tag is deleted
And the task_tags row is deleted
And the task now has 0 tags
And no FOREIGN KEY constraint error is thrown
```

### SCN-2 (FR-1) — Removing a tag linked to many tasks removes all join rows
```
Given tag "urgent" linked to 3 tasks (3 task_tags rows)
When removeTag(tagId) runs
Then all 3 task_tags rows are deleted
And zero orphan task_tags rows with that tag_id remain
And each of the 3 tasks shows 0 tags
```

### SCN-3 (FR-1) — Removing an unlinked tag still works
```
Given tag "later" linked to no tasks
When removeTag(tagId) runs
Then the tag is deleted
And no error is thrown
```

### SCN-4 (FR-2) — openFile spy works under SWC transform
```
Given the openFile test mocks child_process.spawn
When service.openFile(refId) runs
Then spawn is called exactly once
And the call uses the correct per-platform opener (open/xdg-open/explorer.exe)
And no shell option is set
And the returned child is unref()'d
And no "Cannot redefine property" error occurs
```

### SCN-5 (FR-2) — openFile production behavior unchanged
```
Given the openFile implementation
When the FR-2 fix is applied
Then openFile still spawns the platform opener detached, no shell, with unref()
And the only diff is in the test (or a non-behavioral seam), not in the spawn call semantics
```

### SCN-6 (FR-3) — Onboard empty-seed returns default_board_id null
```
Given onboard({ display_name, timezone, seed: 'empty' })
When it resolves
Then result.onboarded_at is not null
And result.default_board_id === null   (strictly null, not undefined)
And createSampleBoard was not called
```

### SCN-7 (FR-3) — Onboard sample-seed still sets default_board_id
```
Given onboard({ ..., seed: 'sample' })
When it resolves
Then default_board_id is a real numeric board id (regression guard for FR-3 normalization)
```

---

## ICT tasks (ordered)

Estimate scale: S = ≤30 min, M = 30–90 min, L = 90+ min.

### Backend (apps/api)

- **ICT-69 (M)** [FR-1] `tags.service.ts` `removeTag`: wrap in a transaction — delete `task_tags WHERE tag_id = :id` (via QueryBuilder or join-table repo), then delete the tag. Match the existing cascade pattern used elsewhere (boards/file-refs). Verify the existing cascade test passes and add the orphan-row assertion. Linked: SCN-1, SCN-2, SCN-3.

- **ICT-70 (S)** [FR-1] Extend `tags.service.spec.ts`: SCN-2 (3-task fan-out, assert 0 orphan `task_tags` rows for that tag_id via a raw count query) and SCN-3 (unlinked tag removes cleanly). Linked: SCN-2, SCN-3.

- **ICT-71 (S)** [FR-2] `file-refs.service.spec.ts`: replace `vi.spyOn(childProcess, 'spawn')` with `vi.mock('child_process')` factory exposing a mockable `spawn`. Keep all existing assertions (per-platform binary, no shell, unref, `{ opened: true }`). No change to `file-refs.service.ts` unless a seam is strictly required. Linked: SCN-4, SCN-5.

- **ICT-72 (S)** [FR-3] Resolve the null-vs-undefined mismatch: inspect `settings.service.ts` onboard return + the response/serialization contract. If the service returns `undefined` for `default_board_id` on empty seed, normalize to `null` in the service. If only the test mock is wrong, fix the mock. Ensure the wire contract is `number | null`. Keep SCN-7 (sample seed) green. Linked: SCN-6, SCN-7.

### Verification

- **ICT-73 (S)** [NFR-1,2] Run full API suite — expect 220/220, 0 failures. Run `pnpm --filter @tasknote/api build`. Confirm no production behavior regressions (`openFile` semantics, tag/settings contracts). Linked: all NFR.

---

## Task counts

- Backend: ICT-69..72 (4 tasks): 3 S, 1 M
- Verification: ICT-73 (1 task): 1 S

**Total: 5 tasks** (S: 4, M: 1, L: 0)

Scenarios: 7
Requirements: 3 functional + 5 NFR = 8

## Execution order

ICT-69 → ICT-70 (tags, 70 depends on 69) | ICT-71 (file-refs, independent) | ICT-72 (settings, independent)
then ICT-73 (verify).
FR-1/2/3 are independent modules — 69+71+72 can run in parallel; 70 after 69.
