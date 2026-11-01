import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApplication } from './bootstrap/configure-application.js';
import type { ApplicationConfig } from './config/configuration.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  configureApplication(app, { enableShutdownHooks: true });

  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<ApplicationConfig>('app');

  await app.listen(appConfig.port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  // The application logger may not exist if Nest failed during bootstrapping.
  console.error('Failed to start Buildora API', error);
  process.exitCode = 1;
});
