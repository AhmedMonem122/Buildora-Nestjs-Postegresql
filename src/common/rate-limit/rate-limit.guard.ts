import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { RateLimitConfig } from '../../config/configuration.js';
import {
  RATE_LIMIT_METADATA_KEY,
  SKIP_RATE_LIMIT_METADATA_KEY,
  type RateLimitOptions,
} from './rate-limit.decorator.js';
import { RateLimitService } from './rate-limit.service.js';

/**
 * Applies the fixed-window rate limit to every HTTP route.
 *
 * Route-level `@RateLimit()` wins over the global configuration and
 * `@SkipRateLimit()` opts a handler out entirely. The client key combines the
 * caller address with the controller and handler names, so one noisy endpoint
 * does not consume the budget of the rest of the API.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly defaultOptions: RateLimitOptions;

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
    private readonly configService: ConfigService,
  ) {
    const config = this.configService.getOrThrow<RateLimitConfig>('rateLimit');

    this.defaultOptions = { limit: config.max, windowMs: config.windowMs };
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType<'http' | 'ws' | 'rpc'>() !== 'http') {
      return true;
    }

    const handler = context.getHandler();
    const controller = context.getClass();
    const isSkipped = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_METADATA_KEY, [
      handler,
      controller,
    ]);

    if (isSkipped) {
      return true;
    }

    const override = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_METADATA_KEY,
      [handler, controller],
    );
    const { limit, windowMs } = override ?? this.defaultOptions;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const now = Date.now();
    const key = `${this.resolveClientIp(request)}:${controller.name}.${handler.name}`;
    const decision = this.rateLimitService.consume(key, limit, windowMs, now);
    const resetSeconds = Math.max(1, Math.ceil((decision.resetAt - now) / 1000));

    response.setHeader('RateLimit-Limit', String(decision.limit));
    response.setHeader('RateLimit-Remaining', String(decision.remaining));
    response.setHeader('RateLimit-Reset', String(resetSeconds));

    if (!decision.allowed) {
      response.setHeader('Retry-After', String(resetSeconds));

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private resolveClientIp(request: Request): string {
    return request.ip ?? request.socket.remoteAddress ?? 'unknown';
  }
}
