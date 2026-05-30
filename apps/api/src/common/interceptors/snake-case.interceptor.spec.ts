import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { of } from 'rxjs';
import { SnakeCaseInterceptor, toSnakeCaseDeep } from './snake-case.interceptor';
import type { ExecutionContext, CallHandler } from '@nestjs/common';

// ---------------------------------------------------------------------------
// ICT-80: unit tests for the pure toSnakeCaseDeep helper
// ---------------------------------------------------------------------------

describe('toSnakeCaseDeep', () => {
  it('converts top-level camelCase keys to snake_case', () => {
    expect(toSnakeCaseDeep({ columnId: 1, dueDate: 'x' })).toEqual({
      column_id: 1,
      due_date: 'x',
    });
  });

  it('converts nested object keys recursively', () => {
    expect(toSnakeCaseDeep({ a: { taskId: 3 } })).toEqual({ a: { task_id: 3 } });
  });

  it('converts keys in arrays of objects', () => {
    expect(toSnakeCaseDeep([{ boardId: 1 }])).toEqual([{ board_id: 1 }]);
  });

  it('is idempotent — already snake_case keys are unchanged', () => {
    const input = { tag_ids: [1], id: 2 };
    expect(toSnakeCaseDeep(input)).toEqual({ tag_ids: [1], id: 2 });
  });

  it('passes null through unchanged', () => {
    expect(toSnakeCaseDeep(null)).toBeNull();
  });

  it('passes number through unchanged', () => {
    expect(toSnakeCaseDeep(42)).toBe(42);
  });

  it('passes string through unchanged', () => {
    expect(toSnakeCaseDeep('hello')).toBe('hello');
  });

  it('passes boolean through unchanged', () => {
    expect(toSnakeCaseDeep(true)).toBe(true);
    expect(toSnakeCaseDeep(false)).toBe(false);
  });

  it('handles mixed snake and camel keys in same object', () => {
    expect(toSnakeCaseDeep({ tag_ids: [1], columnId: 2 })).toEqual({
      tag_ids: [1],
      column_id: 2,
    });
  });

  it('preserves Date instances without stringifying them', () => {
    const d = new Date('2026-01-15T00:00:00.000Z');
    const result = toSnakeCaseDeep({ dueDate: d }) as Record<string, unknown>;
    expect(result['due_date']).toBeInstanceOf(Date);
    expect(result['due_date']).toBe(d);
  });

  it('handles arrays of primitives', () => {
    expect(toSnakeCaseDeep([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('handles deeply nested mixed structure', () => {
    const input = {
      boardId: 1,
      columns: [
        {
          columnId: 10,
          tasks: [{ taskId: 100, tag_ids: [1, 2], dueDate: null }],
        },
      ],
    };
    expect(toSnakeCaseDeep(input)).toEqual({
      board_id: 1,
      columns: [
        {
          column_id: 10,
          tasks: [{ task_id: 100, tag_ids: [1, 2], due_date: null }],
        },
      ],
    });
  });

  it('does not stack-overflow on a circular reference', () => {
    const obj: Record<string, unknown> = { taskId: 7, dueDate: '2026-06-15' };
    obj.self = obj; // genuine cycle

    expect(() => toSnakeCaseDeep(obj)).not.toThrow();

    const result = toSnakeCaseDeep(obj) as Record<string, unknown>;
    // non-circular keys still snake-cased
    expect(result.task_id).toBe(7);
    expect(result.due_date).toBe('2026-06-15');
    // the circular branch is returned as-is rather than recursed into
    expect(result.self).toBe(obj);
  });

  it('does not treat distinct-but-repeated objects as cycles', () => {
    const shared = { fooBar: 1 };
    const result = toSnakeCaseDeep({ a: shared, b: shared }) as Record<
      string,
      unknown
    >;
    // both branches fully mapped — repetition is not a cycle
    expect(result.a).toEqual({ foo_bar: 1 });
    expect(result.b).toEqual({ foo_bar: 1 });
  });
});

// ---------------------------------------------------------------------------
// ICT-81: integration assertion — interceptor transforms response correctly
// ---------------------------------------------------------------------------

describe('SnakeCaseInterceptor — ICT-81', () => {
  function buildCallHandler(returnValue: unknown): CallHandler {
    return { handle: () => of(returnValue) };
  }

  it('transforms a task-entity-shaped object to snake_case through the interceptor', async () => {
    const interceptor = new SnakeCaseInterceptor();
    const ctx = {} as ExecutionContext; // interceptor does not read context

    const sampleTask = {
      id: 1,
      columnId: 5,
      title: 'Fix the bug',
      descriptionMd: null,
      priority: 'high',
      dueDate: null,
      position: 0,
      archivedAt: null,
      completedAt: null,
      committedOn: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      tag_ids: [1, 2],
    };

    const handler = buildCallHandler(sampleTask);
    const result = await new Promise((resolve, reject) => {
      interceptor.intercept(ctx, handler).subscribe({ next: resolve, error: reject });
    }) as Record<string, unknown>;

    // Snake-case keys must be present
    expect(result['column_id']).toBe(5);
    expect(result['description_md']).toBeNull();
    expect(result['due_date']).toBeNull();
    expect(result['archived_at']).toBeNull();
    expect(result['completed_at']).toBeNull();
    expect(result['committed_on']).toBeNull();
    expect(result['created_at']).toBeInstanceOf(Date);
    expect(result['updated_at']).toBeInstanceOf(Date);

    // CamelCase keys must NOT be present
    expect(Object.keys(result)).not.toContain('columnId');
    expect(Object.keys(result)).not.toContain('dueDate');
    expect(Object.keys(result)).not.toContain('descriptionMd');
    expect(Object.keys(result)).not.toContain('archivedAt');
    expect(Object.keys(result)).not.toContain('completedAt');
    expect(Object.keys(result)).not.toContain('committedOn');
    expect(Object.keys(result)).not.toContain('createdAt');
    expect(Object.keys(result)).not.toContain('updatedAt');

    // Already-snake_case keys stay unchanged
    expect(result['tag_ids']).toEqual([1, 2]);
    expect(result['id']).toBe(1);
    expect(result['title']).toBe('Fix the bug');
  });

  it('transforms an array of entities (list endpoint shape)', async () => {
    const interceptor = new SnakeCaseInterceptor();
    const ctx = {} as ExecutionContext;

    const tasks = [
      { id: 1, columnId: 5, title: 'Task A' },
      { id: 2, columnId: 6, title: 'Task B' },
    ];

    const handler = buildCallHandler(tasks);
    const result = await new Promise((resolve, reject) => {
      interceptor.intercept(ctx, handler).subscribe({ next: resolve, error: reject });
    }) as Record<string, unknown>[];

    expect(result[0]['column_id']).toBe(5);
    expect(result[1]['column_id']).toBe(6);
    expect(Object.keys(result[0])).not.toContain('columnId');
    expect(Object.keys(result[1])).not.toContain('columnId');
  });

  it('passes through null response unchanged', async () => {
    const interceptor = new SnakeCaseInterceptor();
    const ctx = {} as ExecutionContext;

    const handler = buildCallHandler(null);
    const result = await new Promise((resolve, reject) => {
      interceptor.intercept(ctx, handler).subscribe({ next: resolve, error: reject });
    });

    expect(result).toBeNull();
  });
});
