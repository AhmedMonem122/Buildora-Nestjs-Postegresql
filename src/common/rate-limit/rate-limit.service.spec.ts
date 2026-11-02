import { RateLimitService } from './rate-limit.service.js';

describe('RateLimitService', () => {
  it('allows requests up to the limit and reports the remaining budget', () => {
    const service = new RateLimitService();
    const now = 1_000;

    expect(service.consume('client-a', 2, 60_000, now)).toEqual({
      allowed: true,
      limit: 2,
      remaining: 1,
      resetAt: now + 60_000,
    });
    expect(service.consume('client-a', 2, 60_000, now + 10)).toEqual({
      allowed: true,
      limit: 2,
      remaining: 0,
      resetAt: now + 60_000,
    });
    expect(service.consume('client-a', 2, 60_000, now + 20)).toEqual({
      allowed: false,
      limit: 2,
      remaining: 0,
      resetAt: now + 60_000,
    });
  });

  it('opens a new window once the previous one expires', () => {
    const service = new RateLimitService();
    const windowMs = 1_000;

    service.consume('client-a', 1, windowMs, 0);
    expect(service.consume('client-a', 1, windowMs, 999).allowed).toBe(false);

    expect(service.consume('client-a', 1, windowMs, 1_000)).toEqual({
      allowed: true,
      limit: 1,
      remaining: 0,
      resetAt: 2_000,
    });
  });

  it('tracks each client key independently', () => {
    const service = new RateLimitService();

    service.consume('client-a', 1, 60_000, 0);

    expect(service.consume('client-b', 1, 60_000, 0).allowed).toBe(true);
    expect(service.consume('client-a', 1, 60_000, 0).allowed).toBe(false);
  });

  it('never reports a negative remaining budget', () => {
    const service = new RateLimitService();

    service.consume('client-a', 1, 60_000, 0);
    service.consume('client-a', 1, 60_000, 0);
    const decision = service.consume('client-a', 1, 60_000, 0);

    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });
});
