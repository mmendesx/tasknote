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

export function toSnakeCaseDeep(value: unknown): unknown {
  // null and primitives — return as-is
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Dates — let Nest's JSON serializer handle ISO stringification
  if (value instanceof Date) {
    return value;
  }

  // Arrays — recurse each element
  if (Array.isArray(value)) {
    return value.map(toSnakeCaseDeep);
  }

  // Objects (including TypeORM class instances) — rebuild with snake_case keys
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    result[toSnakeKey(key)] = toSnakeCaseDeep(
      (value as Record<string, unknown>)[key],
    );
  }
  return result;
}

@Injectable()
export class SnakeCaseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(toSnakeCaseDeep));
  }
}
