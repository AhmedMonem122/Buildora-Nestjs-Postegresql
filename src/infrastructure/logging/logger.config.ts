import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import { REQUEST_ID_HEADER } from '../../common/constants/app.constants.js';
import type { ApplicationConfig, LoggingConfig } from '../../config/configuration.js';

interface RequestWithCorrelationId extends IncomingMessage {
  requestId?: string;
}

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'refreshToken',
  'accessToken',
  'token',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.token',
];

export function buildLoggerParams(configService: ConfigService): Params {
  const app = configService.getOrThrow<ApplicationConfig>('app');
  const logging = configService.getOrThrow<LoggingConfig>('logging');

  return {
    pinoHttp: {
      level: logging.level,
      base: {
        service: 'buildora-api',
        environment: app.nodeEnv,
        version: app.version,
      },
      genReqId: (request: IncomingMessage, response: ServerResponse) => {
        const requestWithId = request as RequestWithCorrelationId;
        const requestId = requestWithId.requestId ?? randomUUID();

        requestWithId.requestId = requestId;

        if (!response.headersSent) {
          response.setHeader(REQUEST_ID_HEADER, requestId);
        }

        return requestId;
      },
      redact: {
        paths: REDACTED_PATHS,
        censor: '[REDACTED]',
      },
      autoLogging: {
        ignore: (request: IncomingMessage) => request.url?.includes('/health') ?? false,
      },
      serializers: {
        req: (request: IncomingMessage) => ({
          id: (request as RequestWithCorrelationId).requestId,
          method: request.method,
          url: request.url,
        }),
        res: (response: ServerResponse) => ({
          statusCode: response.statusCode,
        }),
      },
      transport:
        app.isProduction || app.isTest
          ? undefined
          : {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname,service,environment,version',
              },
            },
    },
  };
}
