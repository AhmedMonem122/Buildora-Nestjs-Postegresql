import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { ApplicationConfig } from '../../config/configuration.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { LivenessDataDto, ReadinessDataDto } from './dto/health-response.dto.js';

const READINESS_TIMEOUT_MS = 5_000;

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthService.name);
  }

  getLiveness(): LivenessDataDto {
    const app = this.configService.getOrThrow<ApplicationConfig>('app');

    return {
      status: 'ok',
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      timestamp: new Date().toISOString(),
      version: app.version,
    };
  }

  async getReadiness(): Promise<ReadinessDataDto> {
    const app = this.configService.getOrThrow<ApplicationConfig>('app');
    const startedAt = Date.now();

    try {
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`, READINESS_TIMEOUT_MS);
    } catch (error) {
      this.logger.error({ err: error }, 'Database readiness probe failed');
      throw new ServiceUnavailableException('The service is not ready to accept traffic.');
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: app.version,
      checks: {
        database: {
          status: 'up',
          latencyMs: Date.now() - startedAt,
        },
      },
    };
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });

    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
