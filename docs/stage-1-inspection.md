# Stage 1 — Repository Inspection

**Date:** 2026-11-02  
**Repository:** `AhmedMonem122/Buildora-Nestjs-Postegresql`  
**Branch inspected:** `master` (single commit: `2708974 init: init buildora project`)

## What existed before implementation

The repository contained the unmodified NestJS 12 starter:

```
src/app.controller.ts
src/app.controller.spec.ts
src/app.module.ts
src/app.service.ts
src/main.ts
test/app.e2e-spec.ts
```

Configuration files: `package.json`, `tsconfig.json`, `tsconfig.build.json`,
`nest-cli.json`, `vitest.config.ts`, `vitest.config.e2e.ts`, `oxlint.json`,
`.prettierrc`, `.gitignore`, and the default NestJS README.

There were **no**:

- ERD documents, diagrams, or database specifications.
- Prisma schema, migrations, or Prisma configuration.
- Authentication, RBAC, or business modules.
- Environment files or deployment configuration.
- Architecture documentation.

The baseline `npm run build` and `npm test` both passed before any change.

## Notable starter characteristics

| Characteristic | Implication |
| --- | --- |
| `"type": "module"` + `module: nodenext` | All relative imports require `.js` extensions; the project is ESM-first. |
| NestJS 12 | Requires the matching `@nestjs/config`, `@nestjs/swagger`, and `nestjs-pino` major versions. |
| Vitest 4 | Replaces Jest. Uses the same `@nestjs/testing` utilities. |
| `oxlint` | Fast, but less configurable than ESLint for typed rules. Replaced with ESLint 10 + typescript-eslint. |
| `@nestjs/mau` dev dependency | Unused by the project; removed. |

## Dependency decisions

| Dependency | Version | Reason |
| --- | --- | --- |
| `prisma` / `@prisma/client` | 7.10.1 | Current stable v7. Prisma 7 requires a driver adapter and a `prisma.config.ts`. |
| `@prisma/adapter-pg` + `pg` | 7.10.1 / 8.23.1 | Required PostgreSQL driver adapter for Prisma 7; works with Neon pooling. |
| `@nestjs/config` | 12.x | Typed configuration and startup validation. |
| `@nestjs/swagger` | 12.x | OpenAPI document generation. |
| In-house rate limiter | — | Fixed-window guard; `@nestjs/throttler` was rejected because its CommonJS output calls `require()` on the ESM-only `@nestjs/common` and crashes on Vercel. |
| `nestjs-pino` + `pino` | 5.x / 10.x | Structured JSON logs and request correlation. |
| `helmet` | 8.x | Security headers. |
| `pug` | 3.x | Server-rendered transactional email templates (requested). |
| `eslint` + `typescript-eslint` | 10.x / 8.x | Typed linting with strict rules. |

`npm audit --omit=dev` reports **0 vulnerabilities** in production dependencies. The full
audit reports 13 moderate findings in dev-only tooling (a `minimatch` chain reached through
ESLint and the Nest CLI); these are tracked for upgrade once the upstream packages relax
their ranges. No production dependency was introduced to work around them.

## Deployment concerns identified

1. **No persistent server on Vercel.** The Nest app must be created once per warm
   function instance and reused; no WebSocket gateway or in-memory job queue.
2. **Prisma 7 + Neon.** The API must use the pooled connection; migrations must use the
   direct connection. `DATABASE_POOL_MAX` should be low (1) on Vercel.
3. **Prisma Client output.** Prisma 7 generates TypeScript into `src/generated/prisma`.
   It must be generated during install/build and bundled into the function.
4. **Decorator metadata.** NestJS dependency injection depends on
   `emitDecoratorMetadata`. Vercel now ships a zero-configuration NestJS preset that
   compiles `src/main.ts` and keeps those semantics, so the project uses it instead of a
   hand-written function entry. Any future change must preserve decorator metadata; a
   plain esbuild bundle without metadata breaks DI at runtime.
5. **In-memory rate limiting.** The in-house fixed-window guard keeps counters per
   instance. Acceptable for the MVP; production should use Vercel WAF or a shared store.
6. **Pug assets.** Templates must be copied to `dist` by `nest build` and included in the
   Vercel function bundle.
7. **Migrations.** They must run as an explicit deployment step, never inside a request.
8. **Node engine warning.** The Nest CLI's Angular schematics dependency declares a newer
   Node range than the local Node 22.17.0. Builds pass; upgrading to Node 24 LTS removes
   the warning.

## Missing architectural input

The approved Buildora ERD is **not present in the repository** and was not supplied in
the task description. Database models cannot be implemented faithfully without it.

The following decisions are known from the brief and will be preserved:

- `Product` is separate from `VendorListing`.
- One `VendorListing` per `ProductVariant` per vendor in v1.
- One checkout creates one parent `Order` and multiple `VendorOrder`s.
- Users can belong to multiple vendors and hold multiple vendor roles.
- Platform roles are separate from vendor roles.
- Inventory is independent from catalog data.
- RFQ/quotation flows are separate from checkout orders.
- Historical prices and addresses are immutable snapshots.
- Financial records use `Decimal(19,4)` and must remain reconcilable.
- Tenant isolation is enforced in the database and in authorization checks.

## Proposed module implementation order

1. Identity & Access (users, sessions, verification/reset tokens).
2. Vendors & Memberships (vendor profiles, members, roles, permissions).
3. Catalog (categories, products, variants, media, vendor listings).
4. Inventory (warehouses, stock, reservations).
5. Cart & Checkout.
6. Orders (parent order, vendor orders, snapshots).
7. Payments, refunds, webhook events.
8. Vendor ledger, commissions, payouts.
9. Shipping & delivery.
10. Notifications, messaging, reviews, support.
11. Admin, analytics, RFQ, coupons, background jobs.

Each module adds only the tables it needs, with a migration and tests.

## Open item

The complete approved ERD (entities, relationships, constraints, indexes, and enums) is
required before implementing the identity schema. Until it is provided, the Prisma schema
contains only the generator and datasource configuration.
