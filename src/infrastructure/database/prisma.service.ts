import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { DatabaseConfig } from '../../config/configuration.js';
import { PrismaClient } from '../../generated/prisma/client.js';

const CONNECTION_TIMEOUT_MS = 5_000;
const IDLE_TIMEOUT_MS = 30_000;

/**
 * Owns the single Prisma connection pool for the process. On Vercel each
 * function instance keeps its own small pool, so the pool size is configurable
 * and should be kept low in production (Neon's pooler multiplexes the rest).
 *
 * The pool connects lazily on the first query instead of during module init:
 * a cold start must not fail just because a dependency is slow or briefly
 * unreachable. `/health` stays up and `/health/ready` reports the database
 * state, so an unavailable database becomes a 503 with a clear cause instead
 * of a crashed function.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    const database = configService.getOrThrow<DatabaseConfig>('database');

    const adapter = new PrismaPg({
      connectionString: database.url,
      max: database.poolMax,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: IDLE_TIMEOUT_MS,
      application_name: 'buildora-api',
    });

    super({
      adapter,
      log: ['warn', 'error'],
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
