import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '../../common/constants/error-codes.js';
import { Prisma } from '../../generated/prisma/client.js';

export interface MappedPrismaError {
  status: number;
  code: ErrorCode;
  message: string;
}

const DATABASE_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

/**
 * Translates Prisma errors into safe HTTP responses. Raw database messages are
 * never forwarded because they may expose schema details or query fragments.
 */
@Injectable()
export class PrismaErrorMapper {
  map(exception: unknown): MappedPrismaError | null {
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'The database is temporarily unavailable. Please try again later.',
      };
    }

    if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) {
      return null;
    }

    if (DATABASE_UNAVAILABLE_CODES.has(exception.code)) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'The database is temporarily unavailable. Please try again later.',
      };
    }

    switch (exception.code) {
      case 'P2000':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ERROR_CODES.BAD_REQUEST,
          message: 'One of the provided values is too long.',
        };
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: ERROR_CODES.CONFLICT,
          message: 'A record with the same unique value already exists.',
        };
      case 'P2003':
      case 'P2014':
        return {
          status: HttpStatus.CONFLICT,
          code: ERROR_CODES.CONFLICT,
          message: 'The operation conflicts with a related record.',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: ERROR_CODES.NOT_FOUND,
          message: 'The requested record was not found.',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'An unexpected error occurred.',
        };
    }
  }
}
