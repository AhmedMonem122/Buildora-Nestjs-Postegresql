import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/bootstrap/configure-application.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';

const prismaMock = {
  $queryRaw: vi.fn(),
  $connect: vi.fn(),
  $disconnect: vi.fn(),
};

describe('Health endpoints (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://buildora:buildora@localhost:5432/buildora';
    process.env.LOG_LEVEL = 'silent';
    process.env.SWAGGER_ENABLED = 'false';

    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
    });
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(() => {
    prismaMock.$queryRaw.mockReset();
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  });

  it('GET /api/v1/health returns the liveness envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toEqual({
      success: true,
      data: expect.objectContaining({
        status: 'ok',
        version: '0.1.0',
      }),
    });
    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });

  it('preserves a valid incoming request id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'client-request-123')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('client-request-123');
  });

  it('GET /api/v1/health/ready reports database readiness', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

    expect(response.body).toEqual({
      success: true,
      data: expect.objectContaining({
        status: 'ok',
        checks: {
          database: expect.objectContaining({ status: 'up' }),
        },
      }),
    });
  });

  it('GET /api/v1/health/ready returns 503 when PostgreSQL is unreachable', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));

    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The service is not ready to accept traffic.',
      },
      meta: expect.objectContaining({
        path: '/api/v1/health/ready',
        method: 'GET',
      }),
    });
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

    expect(response.body).toEqual({
      success: false,
      error: expect.objectContaining({
        code: 'NOT_FOUND',
      }),
      meta: expect.objectContaining({
        requestId: expect.any(String),
        timestamp: expect.any(String),
      }),
    });
  });
});
