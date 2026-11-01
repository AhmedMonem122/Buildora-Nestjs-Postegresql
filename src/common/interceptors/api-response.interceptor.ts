import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { ApiSuccessResponse } from '../interfaces/api-response.interface.js';

/**
 * Wraps every successful controller response in a predictable envelope. The
 * frontend can therefore handle success and failure payloads symmetrically.
 */
@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T | null>> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T | null>> {
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data: data ?? null,
      })),
    );
  }
}
