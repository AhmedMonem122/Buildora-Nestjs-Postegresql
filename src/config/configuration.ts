import {
  APP_NAME,
  APP_VERSION,
  DEFAULT_API_PREFIX,
  SWAGGER_PATH,
} from '../common/constants/app.constants.js';
import { DEFAULT_PORT, NodeEnvironment } from './environment.validation.js';

export interface ApplicationConfig {
  name: string;
  version: string;
  nodeEnv: NodeEnvironment;
  isProduction: boolean;
  isTest: boolean;
  port: number;
  apiPrefix: string;
  bodyLimit: string;
}

export interface HttpConfig {
  corsOrigins: string[];
  trustProxy: number;
}

export interface DatabaseConfig {
  url: string;
  directUrl?: string;
  poolMax: number;
}

export interface SwaggerConfig {
  enabled: boolean;
  path: string;
}

export interface LoggingConfig {
  level: string;
}

export interface Configuration {
  app: ApplicationConfig;
  http: HttpConfig;
  database: DatabaseConfig;
  swagger: SwaggerConfig;
  logging: LoggingConfig;
}

const DEVELOPMENT_CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

function readString(key: string, fallback: string): string {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function readRequiredString(key: string): string {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function readOptionalString(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readPositiveInteger(key: string, fallback: number): number {
  const rawValue = process.env[key];
  const parsedValue = rawValue ? Number(rawValue) : Number.NaN;

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function readBoolean(key: string, fallback: boolean): boolean {
  const rawValue = process.env[key]?.trim().toLowerCase();

  if (rawValue === undefined || rawValue.length === 0) {
    return fallback;
  }

  return rawValue === 'true';
}

function parseCorsOrigins(rawValue: string | undefined): string[] {
  return (rawValue ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Maps the validated flat environment into typed, namespaced configuration.
 * Environment validation runs before this factory and guarantees required
 * variables exist.
 */
export function configuration(): Configuration {
  const nodeEnv =
    (process.env.NODE_ENV as NodeEnvironment | undefined) ?? NodeEnvironment.Development;
  const isProduction = nodeEnv === NodeEnvironment.Production;
  const isTest = nodeEnv === NodeEnvironment.Test;
  const configuredCorsOrigins = parseCorsOrigins(readOptionalString('CORS_ORIGINS'));

  if (isProduction && configuredCorsOrigins.includes('*')) {
    throw new Error('CORS_ORIGINS must list explicit origins in production; "*" is not allowed.');
  }

  return {
    app: {
      name: APP_NAME,
      version: APP_VERSION,
      nodeEnv,
      isProduction,
      isTest,
      port: readPositiveInteger('PORT', DEFAULT_PORT),
      apiPrefix: readString('API_PREFIX', DEFAULT_API_PREFIX),
      bodyLimit: readString('BODY_LIMIT', '1mb'),
    },
    http: {
      corsOrigins:
        configuredCorsOrigins.length > 0 || isProduction
          ? configuredCorsOrigins
          : DEVELOPMENT_CORS_ORIGINS,
      trustProxy: isProduction ? 1 : 0,
    },
    database: {
      url: readRequiredString('DATABASE_URL'),
      directUrl: readOptionalString('DIRECT_URL'),
      poolMax: readPositiveInteger('DATABASE_POOL_MAX', 10),
    },
    swagger: {
      enabled: readBoolean('SWAGGER_ENABLED', !isProduction),
      path: SWAGGER_PATH,
    },
    logging: {
      level: readString('LOG_LEVEL', 'info'),
    },
  };
}
