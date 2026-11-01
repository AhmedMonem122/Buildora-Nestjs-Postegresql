# Buildora API

Production-minded backend for **Buildora**, a multi-vendor marketplace for construction
materials, building supplies, and finishing products.

The project is a **modular monolith** built with NestJS, Prisma, and PostgreSQL. It is
designed to run as a Vercel serverless HTTP API while keeping domain logic, data access,
and external integrations independently replaceable.

> **Status:** Foundation complete (Stage 2). Authentication, RBAC, and business modules
> are implemented incrementally. See [Roadmap](#roadmap) for what is and is not built yet.

---

## Table of contents

- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Folder structure](#folder-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database workflow](#database-workflow)
- [API conventions](#api-conventions)
- [Security](#security)
- [Testing](#testing)
- [Deployment (Vercel + Neon + Supabase)](#deployment-vercel--neon--supabase)
- [Architectural decisions](#architectural-decisions)
- [Roadmap](#roadmap)

---

## Architecture

Buildora uses a **modular monolith**: one deployable application composed of independent
NestJS modules with explicit boundaries. There are no microservices.

```
HTTP request
    │
    ▼
Middleware (request id) ──► Guards (auth, RBAC, throttling)
    │
    ▼
Controller (transport only) ──► Application service (use cases)
    │
    ▼
Domain rules / state transitions ──► Prisma data access
    │
    ▼
PostgreSQL (Neon)          External adapters (Brevo, Stripe, Supabase)
```

Key principles:

- Controllers validate input through DTOs and delegate to services.
- Business rules live in services/domain code, never in controllers.
- PostgreSQL is the source of truth; Supabase Realtime is a delivery mechanism only.
- External providers are behind adapters so they can be replaced or mocked.
- Multi-step operations use database transactions.
- Financial values use `Decimal`, never floating point.
- Authorization is deny-by-default and enforced server-side, including tenant isolation.

### Why a modular monolith?

The marketplace has strong transactional requirements (checkout, inventory reservation,
payments, refunds, payouts). A single database and a single deployable unit keep those
operations consistent while the codebase is still small enough to move quickly. Modules
have clear seams so a future extraction (for example, a dedicated search service) does not
require a rewrite.

---

## Technology stack

| Concern | Choice |
| --- | --- |
| Runtime | Node.js 22+, TypeScript 6 (strict) |
| Framework | NestJS 12 (Express adapter) |
| ORM | Prisma ORM 7 with the `prisma-client` generator and `@prisma/adapter-pg` |
| Database | PostgreSQL on Neon (pooled runtime connection) |
| Auth | Custom NestJS authentication: Argon2id, JWT access tokens, rotating refresh tokens |
| Email | Brevo (API/SMTP) with **Pug** templates and a mock provider for local development |
| Payments | Stripe official SDK (test mode, signed webhooks, idempotent processing) |
| Realtime | Supabase Realtime channels (no persistent NestJS WebSocket gateway) |
| Storage | Supabase Storage (private buckets, signed URLs) |
| Documentation | Swagger / OpenAPI via `@nestjs/swagger` |
| Logging | `nestjs-pino` structured JSON logs with request correlation ids |
| Testing | Vitest + Supertest (unit, integration, e2e) |
| Deployment | Vercel Serverless Functions + Neon + Supabase |

> **Testing note:** the NestJS 12 starter uses Vitest. It provides the same NestJS
> `Test.createTestingModule` utilities and runs TypeScript natively, so the project keeps
> Vitest instead of adding a second test runner.

---

## Folder structure

```
.
├── api/
│   └── index.js                  # Vercel function entry (imports compiled output)
├── prisma/
│   ├── schema.prisma             # Prisma schema (models added per approved ERD)
│   └── migrations/               # Versioned SQL migrations
├── src/
│   ├── bootstrap/
│   │   ├── configure-application.ts  # Shared HTTP setup for local + serverless
│   │   └── swagger.ts                # OpenAPI document and Swagger UI
│   ├── common/
│   │   ├── constants/            # App constants, error codes
│   │   ├── decorators/           # @Public(), future @CurrentUser(), @RequirePermissions()
│   │   ├── filters/              # Global exception filter
│   │   ├── interceptors/         # Response envelope
│   │   ├── interfaces/           # Shared API contracts
│   │   ├── middleware/           # Request correlation id
│   │   └── types/                # Express request augmentation
│   ├── config/
│   │   ├── configuration.ts      # Typed, namespaced configuration
│   │   └── environment.validation.ts
│   ├── infrastructure/
│   │   ├── database/             # PrismaService, PrismaErrorMapper, PrismaModule
│   │   └── logging/              # Pino configuration and redaction
│   ├── modules/
│   │   └── health/               # Liveness + readiness probes
│   ├── generated/                # Prisma Client (git-ignored, generated at install/build)
│   ├── app.module.ts
│   ├── main.ts                   # Long-running local server
│   └── serverless.ts             # Cached Nest app for Vercel
├── test/                         # E2E tests
├── prisma.config.ts              # Prisma CLI configuration (Prisma 7)
└── vercel.json
```

Future business modules live under `src/modules/<domain>/` and follow the same shape:

```
modules/orders/
├── dto/
├── orders.controller.ts
├── orders.service.ts
├── orders.module.ts
├── orders.repository.ts        # when Prisma queries become non-trivial
└── orders.service.spec.ts
```

---

## Getting started

### Prerequisites

- Node.js 22.17+ (Node 24 LTS recommended)
- A PostgreSQL database. [Neon](https://neon.tech) free tier is sufficient.
- npm 11+

### 1. Install dependencies

```bash
npm install
```

`postinstall` runs `prisma generate`. The generated client is written to
`src/generated/prisma` and is not committed.

### 2. Configure the environment

```bash
cp .env.example .env
```

Fill in the Neon pooled and direct connection strings. See
[Environment variables](#environment-variables).

### 3. Prepare the database

```bash
npm run prisma:validate
npm run prisma:migrate:deploy   # apply committed migrations
```

During schema development use:

```bash
npm run prisma:migrate:dev -- --name <migration_name>
```

Never use `prisma db push` in this project; every schema change must be a reviewed,
versioned migration.

### 4. Run the API

```bash
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/docs`
- Liveness: `GET /api/v1/health`
- Readiness: `GET /api/v1/health/ready`

### 5. Quality gates

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:e2e
npm run build
```

---

## Environment variables

All variables are validated at startup. The application refuses to boot with an invalid
configuration, so misconfiguration is caught immediately instead of failing later.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `PORT` | No | `3000` | Local HTTP port (ignored by Vercel) |
| `API_PREFIX` | No | `api/v1` | Global route prefix |
| `BODY_LIMIT` | No | `1mb` | Maximum JSON/urlencoded request body |
| `DATABASE_URL` | **Yes** | — | Neon **pooled** connection string used by the API |
| `DIRECT_URL` | No | `DATABASE_URL` | Neon **direct** connection used by Prisma Migrate |
| `DATABASE_POOL_MAX` | No | `10` | Max pg pool connections per process. Use `1` on Vercel |
| `CORS_ORIGINS` | No | dev origins | Comma-separated allowed origins. Empty in production = same-origin only |
| `SWAGGER_ENABLED` | No | `true` outside production | Serves Swagger UI and OpenAPI JSON |
| `LOG_LEVEL` | No | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |

Upcoming stages add `JWT_*`, `BREVO_*`, `STRIPE_*`, and `SUPABASE_*` variables. They will
be documented here when the corresponding module is implemented.

> **Secrets:** never commit `.env`. `.env.example` contains placeholders only. The Supabase
> service role key and Stripe secret key must never be exposed to browser clients.

---

## Database workflow

The approved Buildora ERD is the source of truth for the data model. Models are added
incrementally per module, together with migrations and constraint tests.

### Local development

```bash
# after editing prisma/schema.prisma
npm run prisma:migrate:dev -- --name add_identity_models
npm run prisma:generate
```

Prisma Migrate uses `DIRECT_URL` when present, which avoids running DDL through Neon's
PgBouncer pooler. The application itself uses the pooled `DATABASE_URL`.

### Production

```bash
npm run prisma:migrate:deploy
```

Run this as an explicit deployment step (CI job or local command against Neon), **not**
from a Vercel request handler. Serverless instances must not race to migrate.

### Conventions

- UUID primary keys.
- `Decimal(19,4)` for monetary values.
- Explicit enums for controlled states.
- Unique and composite constraints for tenant isolation.
- Indexes added for real query patterns, reviewed with `EXPLAIN` when data grows.
- Historical prices and addresses stored as immutable snapshots.
- Soft deactivation instead of deleting users with business history.

---

## API conventions

### Success envelope

```json
{
  "success": true,
  "data": {}
}
```

### Error envelope

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed.",
    "details": ["email must be an email"]
  },
  "meta": {
    "requestId": "5f0c...",
    "timestamp": "2026-01-01T00:00:00.000Z",
    "path": "/api/v1/auth/register",
    "method": "POST"
  }
}
```

Error codes are stable machine-readable values (`VALIDATION_ERROR`, `UNAUTHORIZED`,
`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_ERROR`,
`SERVICE_UNAVAILABLE`, …).

### Request correlation

Every request receives an `x-request-id` response header. A valid client-supplied
`x-request-id` is preserved; otherwise a UUID is generated. The same id appears in
structured logs and error responses.

### Validation

- Global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`.
- Unknown properties are rejected instead of silently ignored (mass-assignment defense).
- DTOs document request schemas in Swagger.

### Pagination

List endpoints will use `page`/`limit` with a documented maximum (`MAX_PAGE_SIZE = 100`).
Cursor pagination is preferred for high-volume feeds such as notifications and messages.

---

## Security

Implemented in the foundation:

- Helmet security headers, including CSP tuned for Swagger UI.
- Configurable CORS allow-list; credentials enabled only for known origins.
- Deny-by-default posture prepared via `@Public()`.
- Global input validation with unknown-field rejection.
- Structured logging with redaction of authorization headers, cookies, passwords, and tokens.
- Safe error responses; stack traces and database internals are never returned.
- Prisma parameterized queries (SQL injection protection).
- Request body size limits.
- Rate limiting scaffold (`@nestjs/throttler`) with a global guard.

Planned and tracked for later stages:

- Argon2id password hashing.
- Short-lived JWT access tokens and rotating, hashed refresh tokens with reuse detection.
- Session revocation (single device and all devices).
- Email verification and password reset tokens hashed at rest.
- RBAC for platform and vendor roles.
- Tenant isolation with composite foreign keys and authorization checks.
- Stripe webhook signature verification and idempotent event persistence.
- Private Supabase Storage buckets with signed URLs and upload validation.
- Audit trails for privileged actions.

> **Rate limiting on Vercel:** `@nestjs/throttler` keeps counters in memory, so limits are
> per function instance. This is acceptable for the MVP but is **not** a distributed rate
> limiter. Production hardening should use Vercel WAF or a shared store (for example
> Upstash Redis).

---

## Testing

```bash
npm test          # unit tests
npm run test:e2e  # HTTP e2e tests
npm run test:cov  # coverage
```

Current coverage focuses on the foundation:

- Environment validation (defaults, coercion, required secrets, invalid values).
- Typed configuration mapping and production defaults.
- Global exception filter (validation errors, Prisma errors, hidden internals, sent headers).
- Health service (liveness, readiness success/failure).
- E2E: health endpoints, request-id propagation, standard error envelope.

Tests never call real Stripe, Brevo, or Supabase APIs. Provider adapters will be mocked.

---

## Deployment (Vercel + Neon + Supabase)

### Vercel

1. Import the repository into Vercel.
2. Set the environment variables from the table above. Use the Neon **pooled** URL for
   `DATABASE_URL` and set `DATABASE_POOL_MAX=1`.
3. `vercel.json` builds the Nest app (`npm run build`) and routes all requests to
   `api/index.js`, which imports the compiled `dist/serverless.js`. The Nest application is
   cached per warm function instance.
4. Run migrations separately before deploying a schema change:

   ```bash
   npm run prisma:migrate:deploy
   ```

5. Verify `GET /api/v1/health/ready` after deployment.

### Important serverless constraints

- No persistent WebSocket gateway. Realtime uses Supabase Realtime channels.
- No in-memory session storage. Refresh sessions live in PostgreSQL.
- No in-memory job queue as a production dependency. Background work must use a reliable
  external scheduler/worker (for example a cron-triggered endpoint with an idempotency
  table, or a dedicated worker service).
- Database connections are pooled per instance; Neon's pooler handles cross-instance
  multiplexing.
- Prisma Client is generated at install/build time into `src/generated` and bundled into
  the function output.

### Pug email templates on Vercel

Email templates live in `src/modules/email/templates/*.pug`. When the email module
lands, `nest-cli.json` will copy them into `dist` and `vercel.json` includes `dist/**` in
the function bundle so templates are available at runtime. The email module compiles
templates once and caches them in memory.

### Free-tier notes

- Neon free tier: suitable for a portfolio deployment; compute may suspend when idle.
- Vercel Hobby: serverless function duration and invocation limits apply.
- Supabase free tier: Realtime and Storage quotas apply; private buckets and RLS are
  mandatory for user documents.
- Brevo free tier: daily email limit; use the mock provider locally.
- Stripe: test mode only for the portfolio deployment. Stripe Connect/payouts are not
  assumed to be enabled; vendor payouts start on an internal ledger.

---

## Architectural decisions

| Decision | Rationale |
| --- | --- |
| Modular monolith | Strong transactional consistency for checkout/payments with simple operations |
| Product separate from VendorListing | Catalog data is shared; vendor offers, prices, and availability are per vendor |
| Parent `Order` + per-vendor `VendorOrder` | One checkout, independent fulfilment and settlement per vendor |
| Refresh token rotation with hashed storage | Limits damage from database leaks and detects token reuse |
| Soft deactivation | Preserves orders, payments, reviews, and audit history |
| Prisma driver adapter (`@prisma/adapter-pg`) | Required by Prisma 7; works with Neon pooled connections |
| Response envelope | Consistent client handling and request correlation |
| `nestjs-pino` | Structured JSON logs with redaction and request ids |
| Pug templates | Maintainable, designer-friendly transactional email markup |
| Supabase Realtime over Nest WebSockets | Compatible with serverless deployment |
| Vitest | Native TypeScript ESM testing with NestJS testing utilities |

### Deviations from the original brief

- **Vitest instead of Jest:** the NestJS 12 starter is configured for Vitest and the
  project is ESM-first. The same `@nestjs/testing` utilities are used.
- **ESLint + Prettier:** the starter's `oxlint` was replaced with a typed ESLint flat
  config for stricter TypeScript rules and broader ecosystem familiarity.

---

## Roadmap

| Stage | Scope | Status |
| --- | --- | --- |
| 1 | Repository inspection and implementation plan | Complete |
| 2 | Foundation: config, Prisma, logging, errors, Swagger, health, Vercel entry | Complete |
| 3 | Authentication: register, login, refresh rotation, verification, reset, sessions | Next |
| 4 | RBAC and tenant isolation | Planned |
| 5 | Users, vendors, catalog, inventory, cart, orders, payments, payouts, shipping | Planned |
| 6 | Notifications, messaging, reviews, support, admin, analytics, RFQ, coupons, jobs | Planned |
| 7 | Full test suite, CI, deployment hardening | Planned |

Each stage is implemented, tested, and reviewed before the next one starts. Features are
never marked complete until they are implemented and covered by tests.

---

## License

Proprietary portfolio project. All rights reserved.
