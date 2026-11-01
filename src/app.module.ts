import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor.js';
import { configuration } from './config/configuration.js';
import { validateEnvironment } from './config/environment.validation.js';
import { PrismaModule } from './infrastructure/database/prisma.module.js';
import { buildLoggerParams } from './infrastructure/logging/logger.config.js';
import { HealthModule } from './modules/health/health.module.js';

const nodeEnvironment = process.env.NODE_ENV ?? 'development';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: [`.env.${nodeEnvironment}.local`, '.env.local', '.env'],
      load: [configuration],
      validate: validateEnvironment,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildLoggerParams,
    }),
    // Best-effort per-instance limiting. Production deployments behind multiple
    // serverless instances should additionally use Vercel WAF or a shared store.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
