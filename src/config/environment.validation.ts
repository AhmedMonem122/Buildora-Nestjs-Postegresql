import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
  type ValidationError,
} from 'class-validator';

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export const DEFAULT_PORT = 3000;
const MIN_PORT = 1;
const MAX_PORT = 65_535;

/**
 * Raw environment contract. Values are validated and normalised once at
 * startup so the rest of the application can rely on typed configuration.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(MIN_PORT)
  @Max(MAX_PORT)
  PORT: number = DEFAULT_PORT;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  /** Direct (non-pooled) Neon connection. Used by Prisma Migrate only. */
  @IsOptional()
  @IsString()
  DIRECT_URL?: string;

  @IsString()
  @IsNotEmpty()
  API_PREFIX: string = 'api/v1';

  /** Comma-separated list of allowed browser origins. */
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === '') {
      return undefined;
    }

    if (value === true || value === 'true') {
      return true;
    }

    if (value === false || value === 'false') {
      return false;
    }

    // Return the original value so @IsBoolean reports a useful error.
    return value as unknown;
  })
  @IsBoolean()
  SWAGGER_ENABLED?: boolean;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL: string = 'info';

  @IsString()
  @IsNotEmpty()
  BODY_LIMIT: string = '1mb';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  DATABASE_POOL_MAX: number = 10;

  /** Length of the rate-limit window in milliseconds. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_WINDOW_MS: number = 60_000;

  /** Maximum number of requests per client inside one window. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_MAX: number = 100;
}

function flattenValidationErrors(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const ownMessages = Object.values(error.constraints ?? {}).map(
      (message) => `${path}: ${message}`,
    );

    return [...ownMessages, ...flattenValidationErrors(error.children ?? [], path)];
  });
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    whitelist: true,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${flattenValidationErrors(errors)
        .map((message) => `  - ${message}`)
        .join('\n')}`,
    );
  }

  return validatedConfig;
}
