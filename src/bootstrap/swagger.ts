import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { APP_NAME, APP_VERSION } from '../common/constants/app.constants.js';
import type { SwaggerConfig } from '../config/configuration.js';

const ACCESS_TOKEN_SCHEME = 'access-token';

/**
 * `scripts/copy-swagger-assets.mjs` writes the Swagger UI files here during the
 * build, because Vercel's tracer cannot follow the runtime lookup performed by
 * `swagger-ui-dist`. The NestJS preset bundles the `views` directory unconditionally.
 */
const BUNDLED_SWAGGER_UI_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'views',
  'swagger-ui',
);

export function setupSwagger(app: INestApplication, configService: ConfigService): void {
  const swagger = configService.getOrThrow<SwaggerConfig>('swagger');

  if (!swagger.enabled) {
    return;
  }

  const documentConfig = new DocumentBuilder()
    .setTitle(APP_NAME)
    .setDescription(
      [
        'Multi-vendor marketplace API for construction materials, building supplies, and finishing products.',
        '',
        'All successful responses use `{ "success": true, "data": ... }`.',
        'All failures use `{ "success": false, "error": { "code", "message" }, "meta": { "requestId", ... } }`.',
        'Send the access token as `Authorization: Bearer <token>`.',
      ].join('\n'),
    )
    .setVersion(APP_VERSION)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Short-lived access token issued by the authentication endpoints.',
      },
      ACCESS_TOKEN_SCHEME,
    )
    .addTag('Health', 'Liveness and readiness probes.')
    .addTag('Authentication', 'Registration, login, sessions, and password recovery.')
    .addTag('Users', 'Authenticated user profile management.')
    .addTag('Vendors', 'Vendor stores, memberships, and vendor roles.')
    .addTag('Catalog', 'Products, variants, categories, and vendor listings.')
    .addTag('Inventory', 'Warehouses, stock levels, and reservations.')
    .addTag('Cart', 'Shopping carts and checkout preparation.')
    .addTag('Orders', 'Customer orders and vendor sub-orders.')
    .addTag('Payments', 'Payment intents, refunds, and Stripe webhooks.')
    .addTag('RFQ', 'Requests for quotation and vendor quotations.')
    .build();

  const document = SwaggerModule.createDocument(app, documentConfig);

  SwaggerModule.setup(swagger.path, app, document, {
    ...(existsSync(BUNDLED_SWAGGER_UI_PATH)
      ? { customSwaggerUiPath: BUNDLED_SWAGGER_UI_PATH }
      : {}),
    jsonDocumentUrl: `${swagger.path}-json`,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}

export { ACCESS_TOKEN_SCHEME };
