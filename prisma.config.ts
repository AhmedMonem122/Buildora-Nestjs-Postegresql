import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma Migrate must use Neon's direct connection; the API uses the pooled
 * connection at runtime (DATABASE_URL). An empty fallback keeps code
 * generation working on a fresh clone before `.env` exists.
 */
const migrationsUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: migrationsUrl,
  },
});
