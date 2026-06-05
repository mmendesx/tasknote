import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function toSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

function snakeCaseDeep(value: unknown, seen: WeakSet<object>): unknown {
  // null and primitives — return as-is
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Dates — let Nest's JSON serializer handle ISO stringification
  if (value instanceof Date) {
    return value;
  }

  // Circular reference — return as-is rather than recursing into a cycle.
  // `seen` tracks the CURRENT recursion path (ancestors), not every object
  // ever visited: we remove the value before returning so a shared but
  // non-cyclic object (a DAG diamond) is still fully mapped on each branch.
  // Safe today (loaded relations don't populate back-references), but guards
  // against a stack overflow if an inverse relation is ever eager-loaded.
  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  let result: unknown;
  if (Array.isArray(value)) {
    // Arrays — recurse each element
    result = value.map((item) => snakeCaseDeep(item, seen));
  } else {
    // Objects (including TypeORM class instances) — rebuild with snake_case keys
    const obj: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const snakeKey = toSnakeKey(key);
      const v = (value as Record<string, unknown>)[key];
      if (snakeKey === 'scene_json') {
        // scene_json's VALUE is an opaque, client-owned Excalidraw document.
        // Its interior keys (appState, scrollX, strokeWidth, etc.) are
        // intentionally camelCase and are NOT server property names.
        // Recursing into this value would mangle those keys and break the
        // canvas on the frontend. Pass the value through verbatim; only the
        // KEY itself (already snake_case) participates in the normal mapping.
        obj[snakeKey] = v;
        continue;
      }
      obj[snakeKey] = snakeCaseDeep(v, seen);
    }
    result = obj;
  }

  seen.delete(value);
  return result;
}

export function toSnakeCaseDeep(value: unknown): unknown {
  return snakeCaseDeep(value, new WeakSet<object>());
}

@Injectable()
export class SnakeCaseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(toSnakeCaseDeep));
  }
}
