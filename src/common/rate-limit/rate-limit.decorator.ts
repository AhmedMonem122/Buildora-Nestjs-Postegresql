import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA_KEY = 'rate-limit';
export const SKIP_RATE_LIMIT_METADATA_KEY = 'rate-limit:skip';

export interface RateLimitOptions {
  /** Maximum number of requests allowed per client in the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Overrides the global rate limit for a route or controller.
 *
 * @example
 * ```ts
 * @RateLimit({ limit: 5, windowMs: 60_000 })
 * @Post('login')
 * login() {}
 * ```
 */
export const RateLimit = (options: RateLimitOptions): MethodDecorator =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, options);

/**
 * Disables rate limiting for a route or controller. Use only where a request
 * cannot be abused, for example an idempotent health probe.
 */
export const SkipRateLimit = (): MethodDecorator => SetMetadata(SKIP_RATE_LIMIT_METADATA_KEY, true);
