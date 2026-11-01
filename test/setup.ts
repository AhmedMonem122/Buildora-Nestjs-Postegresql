import 'reflect-metadata';

// Environment is read when `ConfigModule.forRoot()` is evaluated at module
// import time, which happens before test hooks run. Provide safe test defaults
// here so no test can accidentally connect to a real database.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://buildora:buildora@localhost:5432/buildora';
process.env.LOG_LEVEL ??= 'silent';
