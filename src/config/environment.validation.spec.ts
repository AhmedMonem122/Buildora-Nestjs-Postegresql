import { DEFAULT_PORT, validateEnvironment } from './environment.validation.js';

const REQUIRED_ENV = {
  DATABASE_URL: 'postgresql://buildora:buildora@localhost:5432/buildora',
};

describe('validateEnvironment', () => {
  it('applies documented defaults', () => {
    const environment = validateEnvironment({ ...REQUIRED_ENV });

    expect(environment.NODE_ENV).toBe('development');
    expect(environment.PORT).toBe(DEFAULT_PORT);
    expect(environment.API_PREFIX).toBe('api/v1');
    expect(environment.DATABASE_POOL_MAX).toBe(10);
    expect(environment.LOG_LEVEL).toBe('info');
  });

  it('coerces numeric values from strings', () => {
    const environment = validateEnvironment({
      ...REQUIRED_ENV,
      PORT: '4000',
      DATABASE_POOL_MAX: '3',
    });

    expect(environment.PORT).toBe(4000);
    expect(environment.DATABASE_POOL_MAX).toBe(3);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnvironment({})).toThrow(/DATABASE_URL/);
  });

  it('rejects an out-of-range port', () => {
    expect(() => validateEnvironment({ ...REQUIRED_ENV, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unsupported NODE_ENV', () => {
    expect(() => validateEnvironment({ ...REQUIRED_ENV, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('parses SWAGGER_ENABLED as a boolean', () => {
    const enabled = validateEnvironment({ ...REQUIRED_ENV, SWAGGER_ENABLED: 'true' });
    const disabled = validateEnvironment({ ...REQUIRED_ENV, SWAGGER_ENABLED: 'false' });

    expect(enabled.SWAGGER_ENABLED).toBe(true);
    expect(disabled.SWAGGER_ENABLED).toBe(false);
  });
});
