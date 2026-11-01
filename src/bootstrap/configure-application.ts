import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { REQUEST_ID_HEADER } from '../common/constants/app.constants.js';
import { requestIdMiddleware } from '../common/middleware/request-id.middleware.js';
import type { ApplicationConfig, HttpConfig } from '../config/configuration.js';
import { setupSwagger } from './swagger.js';

export interface ApplicationBootstrapOptions {
  enableShutdownHooks?: boolean;
}

/**
 * Shared bootstrap used by both the long-running local server and the Vercel
 * serverless handler. Keeping the setup in one place prevents environment
 * drift between deployments.
 */
export function configureApplication(
  app: NestExpressApplication,
  options: ApplicationBootstrapOptions = {},
): void {
  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<ApplicationConfig>('app');
  const httpConfig = configService.getOrThrow<HttpConfig>('http');

  app.useLogger(app.get(Logger));

  // Registered before Nest initialises its middleware so it is first in the
  // Express stack and every log line can carry the correlation id.
  app.use(requestIdMiddleware);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.useBodyParser('json', { limit: appConfig.bodyLimit });
  app.useBodyParser('urlencoded', { limit: appConfig.bodyLimit, extended: true });

  if (httpConfig.corsOrigins.length > 0) {
    app.enableCors({
      origin: httpConfig.corsOrigins,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', REQUEST_ID_HEADER],
      exposedHeaders: [REQUEST_ID_HEADER],
      maxAge: 86_400,
    });
  }

  app.setGlobalPrefix(appConfig.apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  app.disable('x-powered-by');
  app.set('trust proxy', httpConfig.trustProxy);

  if (options.enableShutdownHooks) {
    app.enableShutdownHooks();
  }

  setupSwagger(app, configService);
}
