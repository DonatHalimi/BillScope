# BillScope

BillScope is a JavaScript-only personal finance MVP built with React, Vite, Tailwind CSS, Shadcn-style JSX primitives, TanStack Query, Recharts, Fastify, Prisma, and PostgreSQL. It includes local simulated bank connections, transaction entry and categorisation, round-up savings, transfers between a user's own accounts, a reactive bill calendar, spending limits, a 30-day balance forecast, and server-enforced role-based access control.

> **Financial integration notice:** the provider is a deterministic mock adapter. BillScope does not connect to real banks or move real money. The transfer and round-up flows only update the local BillScope database. Do not enter actual bank credentials.

## Technology and runtime

- Node.js `>=22.12.0`, npm `>=10`
- Frontend: React 19, Vite, Tailwind CSS 3, React Router, TanStack Query, Recharts, Lucide
- Backend: Node.js ESM, Fastify 5, Prisma Client 6.19 with the JavaScript `prisma-client-js` generator, Argon2id password hashes
- Database: local PostgreSQL on `localhost:5432` (no Docker)
- Testing: Vitest integration/unit tests and Playwright end-to-end tests
- Currency support: EUR (default), USD, GBP, JPY, CHF

Every direct dependency is pinned to an exact version in the root and workspace `package.json` files. Run `npm install` once to resolve transitive dependencies and generate the local npm workspace lockfile.

## Repository structure

```text
billscope/
├── .env.example
├── package.json                 # npm workspaces + concurrently
├── tailwind.config.js           # semantic light/dark token system
├── backend/
│   ├── prisma/schema.prisma
│   ├── prisma/seed.js
│   ├── scripts/prisma.js        # loads the root .env for Prisma CLI
│   └── src/
│       ├── app.js               # Fastify application factory
│       ├── server.js
│       ├── routes/              # auth, accounts, transactions, provider, bills, budgets, forecast, admin
│       ├── services/            # accounting and forecast business logic
│       ├── providers/           # mock bank adapter and provider registry
│       └── tests/                # JS test factories and Vitest coverage
└── frontend/
    ├── src/
    │   ├── api/                 # memory-only access token + refresh synchronization
    │   ├── auth/                # auth context and route guards
    │   ├── components/ui/       # reusable Shadcn-style JSX components
    │   ├── hooks/               # TanStack Query hooks and cache invalidation
    │   └── pages/               # all finance and role-restricted screens
    └── e2e/                     # Playwright tests + reusable factories
```

## 1. Set up local PostgreSQL

Install PostgreSQL locally and make sure the PostgreSQL service is running on port `5432`. Create a database and a dedicated development user using `psql` or pgAdmin. For example, from a `psql` session connected as a PostgreSQL administrator:

```sql
CREATE USER billscope WITH PASSWORD 'choose-a-local-password';
CREATE DATABASE billscope OWNER billscope;
```

If you already have a local PostgreSQL user, you can use that instead. Update the username, password, database, and port in `DATABASE_URL` to match your local setup.

## 2. Configure environment variables

From the repository root:

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

**macOS/Linux**

```bash
cp .env.example .env
```

Replace `JWT_SECRET` and `COOKIE_SECRET` with two different random secrets. Generate each one separately:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

`JWT_SECRET` and `COOKIE_SECRET` must each contain at least 32 bytes. The API refuses to start when required values are missing, too short, or left as the sample placeholder values. Never commit `.env`, reuse production secrets in development, or deploy with the example credentials.

## 3. Install, generate Prisma Client, and migrate

Run these commands from the `billscope` root. npm workspaces install both application packages and the root `concurrently` runner in one step.

```bash
npm install
npm run db:generate
npm run db:migrate
```

`db:migrate` creates the initial local migration on the first run. A live PostgreSQL instance and a valid `DATABASE_URL` are required for migrations. To inspect the database:

```bash
npm run db:studio
```

## 4. Start the complete app

```bash
npm run dev
```

This one command starts both processes with `concurrently`:

- Frontend: `http://localhost:3000`
- API: `http://127.0.0.1:5000`
- Liveness check: `http://127.0.0.1:5000/health`

Use `http://localhost:3000` as the browser origin because the local refresh route verifies the exact `FRONTEND_URL` origin and the `X-Billscope-Client: web` header. Vite proxies `/api` to the Fastify API, so the frontend uses a same-origin request path by default.

## Optional local demo data

Seeding does not create an administrator with a publicly known password. Configure `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env` (the password must be at least 16 characters) to provision an initial admin user. Then run:

```bash
npm run db:seed
```

For deterministic demo transactions, set the following **only in a local development environment** before running the seed command:

```dotenv
BILLSCOPE_SEED_DEMO=true
SEED_DEMO_PASSWORD=use-a-unique-local-demo-password
```

The local demo user is `demo@billscope.local`; its password is the value of `SEED_DEMO_PASSWORD`. If it is omitted, the seed script uses a documented local-only convenience password. Demo seeding is disabled whenever `NODE_ENV=production`.

## Tests and validation

```bash
# Unit and integration checks for the Fastify domain and frontend helpers
npm test

# Browser tests (install Playwright Chromium once if needed)
npm run test:e2e
npx playwright install chromium

# Production frontend bundle
npm run build
```

Backend integration tests use a JavaScript Prisma test double and Fastify's `inject()` interface; they do not require a running PostgreSQL service. Playwright tests stub API responses and verify route guards and registration fields, so they do not modify a real finance database. Run migration checks separately against a local test database before a production deployment.

## MVP 1 feature scope

- Registration requires first name, last name, email, password (12-character minimum), and phone number.
- Access tokens are short-lived JWTs kept only in JavaScript memory. They are not stored in `localStorage`, `sessionStorage`, or IndexedDB.
- Refresh tokens are JWTs rotated on use, stored as SHA-256 hashes in PostgreSQL, and delivered in an HttpOnly, SameSite=Strict cookie. The cookie is signed and restricted to `/api/auth`; refresh/logout also require an exact configured origin and the custom client header. Reuse of a revoked refresh token revokes the remaining token family.
- Registration always creates a `CLIENT`. Role claims are checked server-side for `PROVIDER` and `ADMIN` protected endpoints. Admin role/status changes include guardrails for the last active administrator.
- Category suggestions use deterministic, regex-based rules. They do not call an external AI model.
- Transfers check account ownership, match currencies, reject insufficient balances, and update both sides in a serializable database transaction.
- EUR checking accounts can opt into round-ups. The difference to the next whole euro is transferred to the user's EUR savings account as a separate transaction.
- The forecast calculates `current balance + expected income − (upcoming unpaid bills + average historical spend)`. Average historical spending is the total posted expense amount from the last 90 days divided by three.
- Recurring bills create separately trackable occurrences through the next year. Calendar bill statuses update reactively through TanStack Query.
- Mock-provider sync imports a stable feed with external IDs so the same feed does not change balances or create duplicate transactions when pulled repeatedly.
- The light palette is active. Semantic CSS variables and Tailwind tokens already contain a dark palette behind `data-theme="dark"`, so switching appearance does not require rearranging components.

## MVP 2 extension points (not activated)

- Replace `MockBankProvider` in `backend/src/providers/registry.js` with a Plaid adapter implementing the same institution and transaction-feed boundary. No Plaid credentials or live account connectivity are included.
- The provider connection status is isolated in `BankConnection`, with a bounded 60-second status poll. WebSocket/push updates are not implemented.
- Semantic color variables include both light and dark appearance values. MVP 1 does not expose a user-controlled theme toggle.

## Production hardening checklist

Before handling real financial information, configure HTTPS, proper secrets and secret rotation, a managed PostgreSQL deployment with encrypted backups, production logging and alerting, a password reset/email verification process, data retention/export/deletion controls, privacy/legal disclosures, and a documented incident response procedure. Add an external security review and integration tests against a dedicated PostgreSQL test database. The current provider, transfers, and balance data are local simulations and are not designed to initiate real-world bank payments.
