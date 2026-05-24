/**
 * currentBoard.spec.ts
 *
 * Unit tests for the useCurrentBoardStore (apps/web/src/stores/currentBoard.ts).
 *
 * Focus: optimistic moveTask behaviour
 *   - Mutates local state immediately (before API resolves)
 *   - Rolls back to pre-mutation snapshot on API failure
 *
 * Uses vi.mock() to stub the api module and @tasknote/ui (useToast).
 * Pinia is initialised fresh before each test via setActivePinia + createPinia().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// ── Mock external dependencies BEFORE importing the store ────────────────────
// vi.mock calls are hoisted to the top of the file by the Vitest transform, so
// this placement is intentional and required.

vi.mock('@/api', () => ({
  tasks: {
    moveTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
  boards: {
    getBoard: vi.fn(),
  },
  columns: {
    reorderColumns: vi.fn(),
  },
  tags: {
    addTagToTask: vi.fn(),
    removeTagFromTask: vi.fn(),
  },
}));

vi.mock('@tasknote/ui', () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

// ── Import after mocks are registered ────────────────────────────────────────
import { useCurrentBoardStore } from '@/stores/currentBoard';
import * as api from '@/api';
import type { BoardWithColumns } from '@tasknote/shared';

// ─── Test data builders ───────────────────────────────────────────────────────

function makeBoard(): BoardWithColumns {
  return {
    id: 1,
    name: 'Test Board',
    position: 0,
    created_at: new Date(),
    updated_at: new Date(),
    columns: [
      {
        id: 10,
        board_id: 1,
        name: 'Backlog',
        color: '#5B616B',
        wip_limit: null,
        is_done: false,
        position: 0,
        tasks: [
          {
            id: 100,
            column_id: 10,
            title: 'Task A',
            description_md: null,
            priority: 'medium',
            due_date: null,
            position: 0,
            archived_at: null,
            completed_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      },
      {
        id: 11,
        board_id: 1,
        name: 'Doing',
        color: '#F5C26B',
        wip_limit: null,
        is_done: false,
        position: 1,
        tasks: [],
      },
    ],
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('useCurrentBoardStore.moveTask — optimistic update', () => {
  let store: ReturnType<typeof useCurrentBoardStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useCurrentBoardStore();
    // Seed the store with a known board state
    store.board = makeBoard();
    // Reset all mocks between tests
    vi.resetAllMocks();
  });

  it('moves the task into the target column immediately (before API resolves)', async () => {
    let resolveApiCall!: (value: unknown) => void;
    const pendingApiCall = new Promise((resolve) => {
      resolveApiCall = resolve;
    });

    vi.mocked(api.tasks.moveTask).mockReturnValueOnce(pendingApiCall as Promise<never>);

    // Start the move (do not await — we want to inspect mid-flight state)
    const movePromise = store.moveTask(100, 11, 0);

    // Synchronous: the optimistic mutation should have already fired
    // Task 100 should now be in column 11, not column 10
    const column10 = store.board!.columns.find((c) => c.id === 10)!;
    const column11 = store.board!.columns.find((c) => c.id === 11)!;

    expect(column10.tasks.find((t) => t.id === 100)).toBeUndefined();
    expect(column11.tasks.find((t) => t.id === 100)).toBeDefined();

    // Resolve the API call so the promise settles cleanly
    resolveApiCall({ id: 100, column_id: 11, position: 0 });
    await movePromise;
  });

  it('rolls back to the pre-mutation board state when the API call fails', async () => {
    vi.mocked(api.tasks.moveTask).mockRejectedValueOnce(new Error('Network error'));

    // Take a snapshot of the initial state to compare after rollback
    const initialColumn10TaskIds = store.board!.columns
      .find((c) => c.id === 10)!
      .tasks.map((t) => t.id);

    const initialColumn11TaskIds = store.board!.columns
      .find((c) => c.id === 11)!
      .tasks.map((t) => t.id);

    // Expect the move to throw (the error is re-thrown after rollback)
    await expect(store.moveTask(100, 11, 0)).rejects.toThrow();

    // After failure: state should be restored to original
    const column10After = store.board!.columns.find((c) => c.id === 10)!;
    const column11After = store.board!.columns.find((c) => c.id === 11)!;

    expect(column10After.tasks.map((t) => t.id)).toEqual(initialColumn10TaskIds);
    expect(column11After.tasks.map((t) => t.id)).toEqual(initialColumn11TaskIds);
  });

  it('does not mutate the board when board is null', async () => {
    store.board = null;

    // moveTask should return without throwing when board is null
    await expect(store.moveTask(100, 11, 0)).resolves.toBeUndefined();

    // API must not have been called
    expect(api.tasks.moveTask).not.toHaveBeenCalled();
  });

  it('does not mutate state when the moving task id does not exist in any column', async () => {
    vi.mocked(api.tasks.moveTask).mockResolvedValueOnce({} as never);

    const boardBefore = JSON.stringify(store.board);

    // Task id 9999 does not exist in any column
    await store.moveTask(9999, 11, 0);

    // Board should be unchanged because the mutate early-returns when task not found
    expect(JSON.stringify(store.board)).toBe(boardBefore);
  });

  it('calls api.tasks.moveTask with the correct dto', async () => {
    vi.mocked(api.tasks.moveTask).mockResolvedValueOnce({} as never);

    await store.moveTask(100, 11, 2);

    expect(api.tasks.moveTask).toHaveBeenCalledWith({
      task_id: 100,
      column_id: 11,
      position: 2,
    });
  });
});
