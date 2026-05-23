import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { ApiErrorResponse } from '@tasknote/shared';

/**
 * Maps all thrown exceptions to { error: { code, message, details? } }.
 * Stack traces are logged to stderr and never appear in response bodies.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number;
    let code: string;
    let message: string;
    let details: unknown;

    if (exception instanceof ZodValidationException) {
      // ZodValidationException is a subclass of BadRequestException.
      // Check it BEFORE the generic HttpException branch.
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      code = 'VALIDATION_ERROR';
      message = 'Validation failed';
      details = exception.getZodError().issues;
      this.logger.warn(`[VALIDATION_ERROR] ${message}`, { details });
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        // Honor an explicit code when provided (e.g. ConflictException with { code, message })
        code = typeof resp['code'] === 'string' ? resp['code'] : this.codeFromStatus(status);
        message = (typeof resp['message'] === 'string' ? resp['message'] : null) ?? exception.message;
      } else {
        code = this.codeFromStatus(status);
        message = typeof exceptionResponse === 'string' ? exceptionResponse : exception.message;
      }
      this.logger.warn(`[${code}] ${message}`);
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL';
      message = 'An unexpected error occurred';
      // Log full stack to stderr — never include in response body
      this.logger.error(`[INTERNAL] ${exception.message}`, exception.stack);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL';
      message = 'An unexpected error occurred';
      this.logger.error('[INTERNAL] Unknown exception type', String(exception));
    }

    const body: ApiErrorResponse = { error: { code, message, details } };

    // Omit details key when undefined to keep response clean
    if (details === undefined) {
      delete body.error.details;
    }

    response.status(status).json(body);
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_ERROR';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      default:
        return status >= 500 ? 'INTERNAL' : 'CLIENT_ERROR';
    }
  }
}
