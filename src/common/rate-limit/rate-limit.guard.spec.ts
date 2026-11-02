import { HttpException, HttpStatus, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { RATE_LIMIT_METADATA_KEY, SKIP_RATE_LIMIT_METADATA_KEY } from './rate-limit.decorator.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimitService } from './rate-limit.service.js';

class TestController {
  handler(): void {
    // Route body is irrelevant; the guard inspects the method metadata.
  }
}

function routeHandler(): void {
  // Stand-in for the controller method so tests can inspect its name.
}

interface ResponseMock {
  setHeader: (name: string, value: string) => void;
}

function createContext(type: 'http' | 'rpc', response: ResponseMock): ExecutionContext {
  const request = { ip: '203.0.113.7', socket: { remoteAddress: '203.0.113.7' } };

  return {
    getType: () => type,
    getHandler: () => routeHandler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

interface GuardHarness {
  guard: RateLimitGuard;
  service: RateLimitService;
}

function createGuard(metadata: Record<string, unknown> = {}): GuardHarness {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => metadata[key]),
  } as unknown as Reflector;
  const configService = {
    getOrThrow: vi.fn(() => ({ windowMs: 60_000, max: 2 })),
  } as unknown as ConfigService;
  const service = new RateLimitService();

  return { guard: new RateLimitGuard(reflector, service, configService), service };
}

describe('RateLimitGuard', () => {
  it('allows a request inside the budget and exposes the limit headers', () => {
    const { guard } = createGuard();
    const response = { setHeader: vi.fn() };

    expect(guard.canActivate(createContext('http', response))).toBe(true);
    expect(response.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '2');
    expect(response.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '1');
    expect(response.setHeader).toHaveBeenCalledWith('RateLimit-Reset', '60');
  });

  it('rejects requests over the budget with 429 and Retry-After', () => {
    const { guard } = createGuard();
    const response = { setHeader: vi.fn() };
    const context = createContext('http', response);

    guard.canActivate(context);
    guard.canActivate(context);

    let error: unknown;
    try {
      guard.canActivate(context);
    } catch (caught: unknown) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    expect(response.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '0');
  });

  it('skips the limiter when the route opts out', () => {
    const { guard, service } = createGuard({ [SKIP_RATE_LIMIT_METADATA_KEY]: true });
    const consume = vi.spyOn(service, 'consume');

    expect(guard.canActivate(createContext('http', { setHeader: vi.fn() }))).toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });

  it('uses the route-level override instead of the global budget', () => {
    const { guard } = createGuard({
      [RATE_LIMIT_METADATA_KEY]: { limit: 1, windowMs: 1_000 },
    });
    const response = { setHeader: vi.fn() };
    const context = createContext('http', response);

    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    expect(response.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '1');
  });

  it('ignores non-HTTP execution contexts', () => {
    const { guard, service } = createGuard();
    const consume = vi.spyOn(service, 'consume');

    expect(guard.canActivate(createContext('rpc', { setHeader: vi.fn() }))).toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });
});
