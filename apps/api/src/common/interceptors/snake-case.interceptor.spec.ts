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

  // ICT-diagrams: scene_json opaque-value guard
  it('snake-cases sibling keys but preserves scene_json interior verbatim', () => {
    const expectedScene = {
      version: 1,
      elements: [
        { id: 'a', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: '#000', strokeWidth: 2 },
      ],
      appState: { viewport: { scrollX: 5, scrollY: 6, zoom: 1.5 } },
    };

    const input = {
      sceneJson: expectedScene,
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
    };

    const result = toSnakeCaseDeep(input) as Record<string, unknown>;

    // sibling key must be snake-cased
    expect(Object.keys(result)).not.toContain('createdAt');
    expect(result['created_at']).toBeInstanceOf(Date);

    // scene_json key must exist and the interior must be byte-for-byte identical
    // (the camelCase interior keys — appState, scrollX, strokeWidth — must NOT
    // be mangled to app_state / scroll_x / stroke_width)
    expect(Object.keys(result)).toContain('scene_json');
    expect(result['scene_json']).toEqual(expectedScene);

    // Explicitly confirm the camelCase interior is untouched
    const scene = result['scene_json'] as typeof expectedScene;
    expect(scene.appState).toBeDefined();
    expect(scene.appState.viewport.scrollX).toBe(5);
    expect(scene.appState.viewport.scrollY).toBe(6);
    expect(scene.elements[0].strokeWidth).toBe(2);

    // Confirm the mangled forms do NOT appear
    expect(scene).not.toHaveProperty('app_state');
    const viewport = scene.appState.viewport as Record<string, unknown>;
    expect(viewport).not.toHaveProperty('scroll_x');
    expect(viewport).not.toHaveProperty('scroll_y');
    expect(scene.elements[0] as unknown as Record<string, unknown>).not.toHaveProperty('stroke_width');
  });

  it('still snake-cases normal nested objects outside scene_json', () => {
    const result = toSnakeCaseDeep({ fooBar: { bazQux: 1 } }) as Record<string, unknown>;
    expect(result).toEqual({ foo_bar: { baz_qux: 1 } });
    expect(result).not.toHaveProperty('fooBar');
    expect((result['foo_bar'] as Record<string, unknown>)).not.toHaveProperty('bazQux');
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
