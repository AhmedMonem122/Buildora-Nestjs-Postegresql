import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaErrorMapper } from '../../infrastructure/database/prisma-error.mapper.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

interface LoggerMock {
  setContext: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
}

interface ResponseMock {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  headersSent: boolean;
}

function createLoggerMock(): LoggerMock {
  return {
    setContext: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function createHost(request: Partial<Request>): {
  host: ArgumentsHost;
  response: ResponseMock;
} {
  const response: ResponseMock = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    headersSent: false,
  };

  const host = {
    switchToHttp: () => ({
      getRequest: () => request as Request,
      getResponse: () => response as unknown as Response,
    }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

function createFilter(logger: LoggerMock): AllExceptionsFilter {
  return new AllExceptionsFilter(logger as unknown as PinoLogger, new PrismaErrorMapper());
}

describe('AllExceptionsFilter', () => {
  const request: Partial<Request> = {
    method: 'POST',
    originalUrl: '/api/v1/auth/register',
    requestId: 'request-id-123',
  };

  it('formats validation errors with a stable error code', () => {
    const logger = createLoggerMock();
    const filter = createFilter(logger);
    const { host, response } = createHost(request);

    filter.catch(
      new BadRequestException({
        message: ['email must be an email', 'password is too weak'],
        error: 'Bad Request',
        statusCode: 400,
      }),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed.',
          details: ['email must be an email', 'password is too weak'],
        }),
        meta: expect.objectContaining({
          requestId: 'request-id-123',
          method: 'POST',
          path: '/api/v1/auth/register',
        }),
      }),
    );
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('hides unexpected error details and logs the original exception', () => {
    const logger = createLoggerMock();
    const filter = createFilter(logger);
    const { host, response } = createHost(request);

    filter.catch(new Error('connection string leaked here'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
        },
      }),
    );
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('maps Prisma unique constraint violations to 409 Conflict', () => {
    const logger = createLoggerMock();
    const filter = createFilter(logger);
    const { host, response } = createHost(request);
    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.10.1',
      meta: { target: ['email'] },
    });

    filter.catch(prismaError, host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'CONFLICT' }),
      }),
    );
  });

  it('does not write a second response when headers were already sent', () => {
    const logger = createLoggerMock();
    const filter = createFilter(logger);
    const { host, response } = createHost(request);
    response.headersSent = true;

    filter.catch(new BadRequestException('Invalid input'), host);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
