import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { HealthService } from './health.service.js';

interface PrismaMock {
  $queryRaw: ReturnType<typeof vi.fn>;
}

function createService(prisma: PrismaMock): HealthService {
  const configService = {
    getOrThrow: () => ({ version: '0.1.0' }),
  } as unknown as ConfigService;

  const logger = {
    setContext: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;

  return new HealthService(prisma as unknown as PrismaService, configService, logger);
}

describe('HealthService', () => {
  it('reports liveness without touching the database', () => {
    const prisma: PrismaMock = { $queryRaw: vi.fn() };
    const service = createService(prisma);

    const result = service.getLiveness();

    expect(result.status).toBe('ok');
    expect(result.version).toBe('0.1.0');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports readiness when the database responds', async () => {
    const prisma: PrismaMock = {
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const service = createService(prisma);

    const result = await service.getReadiness();

    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('throws 503 when the database probe fails', async () => {
    const prisma: PrismaMock = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')),
    };
    const service = createService(prisma);

    await expect(service.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
