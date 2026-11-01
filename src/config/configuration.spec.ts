import { configuration } from './configuration.js';

describe('configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps validated environment variables into namespaced config', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://buildora:buildora@localhost:5432/buildora');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PORT', '4000');
    vi.stubEnv('CORS_ORIGINS', 'https://app.buildora.test, https://admin.buildora.test');

    const config = configuration();

    expect(config.app.port).toBe(4000);
    expect(config.app.isProduction).toBe(false);
    expect(config.database.url).toBe('postgresql://buildora:buildora@localhost:5432/buildora');
    expect(config.http.corsOrigins).toEqual([
      'https://app.buildora.test',
      'https://admin.buildora.test',
    ]);
    expect(config.swagger.enabled).toBe(true);
  });

  it('disables CORS origins and Swagger by default in production', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://buildora:buildora@localhost:5432/buildora');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORS_ORIGINS', '');

    const config = configuration();

    expect(config.http.corsOrigins).toEqual([]);
    expect(config.http.trustProxy).toBe(1);
    expect(config.swagger.enabled).toBe(false);
  });

  it('fails fast when the database URL is missing', () => {
    vi.stubEnv('DATABASE_URL', '');

    expect(() => configuration()).toThrow(/DATABASE_URL/);
  });
});
