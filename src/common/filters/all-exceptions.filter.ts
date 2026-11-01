import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ERROR_CODES, errorCodeForStatus, type ErrorCode } from '../constants/error-codes.js';
import type { ApiErrorResponse } from '../interfaces/api-response.interface.js';
import {
  PrismaErrorMapper,
  type MappedPrismaError,
} from '../../infrastructure/database/prisma-error.mapper.js';

interface NormalizedError {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

const KNOWN_ERROR_CODES = new Set<string>(Object.values(ERROR_CODES));
const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isKnownErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && KNOWN_ERROR_CODES.has(value);
}

/**
 * Single exit point for errors. It guarantees a stable response shape, hides
 * implementation details for 5xx responses, and attaches the correlation id
 * that ties the response to structured logs.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: PinoLogger,
    private readonly prismaErrorMapper: PrismaErrorMapper,
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const normalizedError = this.normalize(exception);
    const requestId = request.requestId ?? 'unknown';

    const payload: ApiErrorResponse = {
      success: false,
      error: {
        code: normalizedError.code,
        message: normalizedError.message,
        ...(normalizedError.details === undefined ? {} : { details: normalizedError.details }),
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        path: request.originalUrl ?? request.url,
        method: request.method,
      },
    };

    const logPayload = {
      requestId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      statusCode: normalizedError.status,
      code: normalizedError.code,
      ...(normalizedError.status >= HTTP_STATUS_INTERNAL_SERVER_ERROR ? { err: exception } : {}),
    };

    if (normalizedError.status >= HTTP_STATUS_INTERNAL_SERVER_ERROR) {
      this.logger.error(logPayload, normalizedError.message);
    } else {
      this.logger.warn(logPayload, normalizedError.message);
    }

    if (!response.headersSent) {
      response.status(normalizedError.status).json(payload);
    }
  }

  private normalize(exception: unknown): NormalizedError {
    const prismaError = this.prismaErrorMapper.map(exception);

    if (prismaError) {
      return this.fromPrismaError(prismaError);
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    return {
      status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
    };
  }

  private fromPrismaError(error: MappedPrismaError): NormalizedError {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const defaultCode = errorCodeForStatus(status);
    const responseBody = exception.getResponse();

    if (status === HTTP_STATUS_INTERNAL_SERVER_ERROR) {
      return {
        status,
        code: defaultCode,
        message: INTERNAL_ERROR_MESSAGE,
      };
    }

    if (status === HTTP_STATUS_TOO_MANY_REQUESTS) {
      return {
        status,
        code: ERROR_CODES.TOO_MANY_REQUESTS,
        message: 'Too many requests. Please try again later.',
      };
    }

    if (typeof responseBody === 'string') {
      return { status, code: defaultCode, message: responseBody };
    }

    if (!isRecord(responseBody)) {
      return { status, code: defaultCode, message: exception.message };
    }

    const responseMessage = responseBody.message;
    const explicitCode = responseBody.code;
    const code = isKnownErrorCode(explicitCode) ? explicitCode : defaultCode;

    if (Array.isArray(responseMessage)) {
      return {
        status,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Validation failed.',
        details: responseMessage,
      };
    }

    if (typeof responseMessage === 'string' && responseMessage.length > 0) {
      return { status, code, message: responseMessage };
    }

    return { status, code, message: exception.message };
  }
}
