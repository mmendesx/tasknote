
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

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

import { useCurrentBoardStore } from '@/stores/currentBoard';
import * as api from '@/api';
import type { BoardWithColumns } from '@tasknote/shared';

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

describe('useCurrentBoardStore.moveTask — optimistic update', () => {
  let store: ReturnType<typeof useCurrentBoardStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useCurrentBoardStore();
    
    store.board = makeBoard();
    
    vi.resetAllMocks();
  });

  it('moves the task into the target column immediately (before API resolves)', async () => {
    let resolveApiCall!: (value: unknown) => void;
    const pendingApiCall = new Promise((resolve) => {
      resolveApiCall = resolve;
    });

    vi.mocked(api.tasks.moveTask).mockReturnValueOnce(pendingApiCall as Promise<never>);

    const movePromise = store.moveTask(100, 11, 0);

    const column10 = store.board!.columns.find((c) => c.id === 10)!;
    const column11 = store.board!.columns.find((c) => c.id === 11)!;

    expect(column10.tasks.find((t) => t.id === 100)).toBeUndefined();
    expect(column11.tasks.find((t) => t.id === 100)).toBeDefined();

    resolveApiCall({ id: 100, column_id: 11, position: 0 });
    await movePromise;
  });

  it('rolls back to the pre-mutation board state when the API call fails', async () => {
    vi.mocked(api.tasks.moveTask).mockRejectedValueOnce(new Error('Network error'));

    const initialColumn10TaskIds = store.board!.columns
      .find((c) => c.id === 10)!
      .tasks.map((t) => t.id);

    const initialColumn11TaskIds = store.board!.columns
      .find((c) => c.id === 11)!
      .tasks.map((t) => t.id);

    await expect(store.moveTask(100, 11, 0)).rejects.toThrow();

    const column10After = store.board!.columns.find((c) => c.id === 10)!;
    const column11After = store.board!.columns.find((c) => c.id === 11)!;

    expect(column10After.tasks.map((t) => t.id)).toEqual(initialColumn10TaskIds);
    expect(column11After.tasks.map((t) => t.id)).toEqual(initialColumn11TaskIds);
  });

  it('does not mutate the board when board is null', async () => {
    store.board = null;

    await expect(store.moveTask(100, 11, 0)).resolves.toBeUndefined();

    expect(api.tasks.moveTask).not.toHaveBeenCalled();
  });

  it('does not mutate state when the moving task id does not exist in any column', async () => {
    vi.mocked(api.tasks.moveTask).mockResolvedValueOnce({} as never);

    const boardBefore = JSON.stringify(store.board);

    await store.moveTask(9999, 11, 0);

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

// ---------------------------------------------------------------------------
// Regression: consecutive optimistic ops must not break on the snapshot clone.
//
// The optimistic snapshot used structuredClone(toRaw(board)). toRaw only unwraps
// the OUTER proxy; after the first optimistic mutation, nested column/task
// reactive proxies survived and structuredClone threw "could not be cloned" —
// silently aborting EVERY mutation after the first (update, move, delete, tag).
// snapshot() now JSON-clones, which is proxy-safe. These tests lock that: a
// second consecutive optimistic op still reaches the API.
// ---------------------------------------------------------------------------

describe('consecutive optimistic mutations survive the snapshot clone', () => {
  let store: ReturnType<typeof useCurrentBoardStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useCurrentBoardStore();
    store.board = makeBoard();
    vi.resetAllMocks();
  });

  it('updateTask twice in a row both call the API (no snapshot throw)', async () => {
    vi.mocked(api.tasks.updateTask).mockResolvedValue({} as never);

    await store.updateTask(100, { title: 'First' });
    await store.updateTask(100, { title: 'Second' });

    expect(api.tasks.updateTask).toHaveBeenCalledTimes(2);
    expect(api.tasks.updateTask).toHaveBeenNthCalledWith(1, 100, { title: 'First' });
    expect(api.tasks.updateTask).toHaveBeenNthCalledWith(2, 100, { title: 'Second' });
  });

  it('moveTask then updateTask both call the API', async () => {
    vi.mocked(api.tasks.moveTask).mockResolvedValue({} as never);
    vi.mocked(api.tasks.updateTask).mockResolvedValue({} as never);

    await store.moveTask(100, 11, 0);
    await store.updateTask(100, { priority: 'high' });

    expect(api.tasks.moveTask).toHaveBeenCalledTimes(1);
    expect(api.tasks.updateTask).toHaveBeenCalledTimes(1);
  });

  it('snapshot() does not throw on a board that has been optimistically mutated', async () => {
    vi.mocked(api.tasks.updateTask).mockResolvedValue({} as never);

    // First op replaces task objects via the optimistic map; the second op must
    // still snapshot the now-mutated board without a clone error.
    await store.updateTask(100, { title: 'A' });
    await expect(store.updateTask(100, { title: 'B' })).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// SCN-8 — quick-add from board does NOT auto-commit (store layer)
//
// QuickAddTaskInput emits a plain title string; the actual API call happens
// inside currentBoard.createTask. This is where the "no committed_on" guarantee
// must be verified — if this test fails, the board path has a real bug.
// ---------------------------------------------------------------------------

describe('SCN-8: quick-add from board does NOT auto-commit', () => {
  let store: ReturnType<typeof useCurrentBoardStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useCurrentBoardStore();
    store.board = makeBoard();
    vi.resetAllMocks();
  });

  it('SCN-8: createTask passes the dto to the API without committed_on', async () => {
    vi.mocked(api.tasks.createTask).mockResolvedValueOnce({
      id: 200,
      column_id: 10,
      title: 'New task',
      description_md: null,
      priority: 'low',
      due_date: null,
      position: 0,
      archived_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as never);

    await store.createTask(10, { title: 'New task', column_id: 10, priority: 'low' });

    expect(api.tasks.createTask).toHaveBeenCalledOnce();
    const dto = vi.mocked(api.tasks.createTask).mock.calls[0][0];
    expect((dto as Record<string, unknown>).committed_on).toBeUndefined();
  });

  it('SCN-8: createTask with an explicit null committed_on does not set a date', async () => {
    vi.mocked(api.tasks.createTask).mockResolvedValueOnce({
      id: 201,
      column_id: 10,
      title: 'Another task',
      description_md: null,
      priority: 'medium',
      due_date: null,
      position: 0,
      archived_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as never);

    await store.createTask(10, {
      title: 'Another task',
      column_id: 10,
      priority: 'medium',
      committed_on: null as any,
    });

    const dto = vi.mocked(api.tasks.createTask).mock.calls[0][0];
    // Whether callers pass null or omit the field, no date string must be sent
    const committedOn = (dto as Record<string, unknown>).committed_on;
    expect(committedOn == null).toBe(true);
  });
});
