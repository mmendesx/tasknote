
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
