import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import argon2 from 'argon2';
import { getConfig } from './config.js';
import { getPrismaClient } from './db/prisma.js';
import { unauthorized, forbidden } from './lib/http-errors.js';
import { authRoutes } from './routes/auth.js';
import { accountRoutes } from './routes/accounts.js';
import { transactionRoutes } from './routes/transactions.js';
import { transferRoutes } from './routes/transfers.js';
import { providerRoutes } from './routes/provider.js';
import { billRoutes } from './routes/bills.js';
import { budgetRoutes } from './routes/budgets.js';
import { forecastingRoutes } from './routes/forecasting.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { profileRoutes } from './routes/profile.js';
import { adminRoutes } from './routes/admin.js';
import { fxRoutes } from './routes/fx.js';
import { recurringRoutes } from './routes/recurring.js';
import { financialHealthRoutes } from './routes/financial-health.js';
import { householdRoutes } from './routes/households.js';

export async function buildApp(options = {}) {
  const config = options.config ?? getConfig();
  const prisma = options.prisma || getPrismaClient();
  const passwordService =
    options.passwordService || { hash: argon2.hash, verify: argon2.verify };
  const dummyPasswordHash =
    options.dummyPasswordHash ||
    (await passwordService.hash('billscope-dummy-credential-never-valid', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    }));

  const app = Fastify({
    logger:
      config.nodeEnv === 'test'
        ? false
        : {
            level: config.nodeEnv === 'development' ? 'info' : 'warn',
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers.set-cookie',
                'req.body.password',
                'req.body.token',
                'req.url'
              ],
              censor: '[REDACTED]'
            }
          },
    bodyLimit: 1024 * 1024,
    trustProxy: config.nodeEnv === 'production' ? 1 : false
  });

  app.decorate('config', config);
  app.decorate('prisma', prisma);
  app.decorate('passwordService', passwordService);
  app.decorate('dummyPasswordHash', dummyPasswordHash);
  app.decorate('householdSockets', new Map());
  app.decorateRequest('currentRole', null);

  await app.register(cookie, { secret: config.cookieSecret, hook: 'onRequest' });

  await app.register(cors, {
    origin: config.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Billscope-Client',
      'Idempotency-Key'
    ]
  });

  await app.register(helmet, {
    contentSecurityPolicy:
      config.nodeEnv === 'production'
        ? {
            directives: {
              defaultSrc: ["'self'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: ["'none'"],
              objectSrc: ["'none'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              fontSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'", config.frontendUrl, 'wss:'],
              upgradeInsecureRequests: []
            }
          }
        : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Too many requests. Please try again shortly.',
      code: 'RATE_LIMITED'
    })
  });

  await app.register(websocket, {
    options: { maxPayload: 16 * 1024, perMessageDeflate: false }
  });

  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { algorithm: 'HS256' }
  });

  app.decorate('authenticate', async function authenticate(request, reply) {
    try {
      await request.jwtVerify();
      if (request.user?.type !== 'access' || !request.user?.sub) {
        throw unauthorized('Invalid access token.');
      }
    } catch {
      return reply
        .code(401)
        .send({ error: 'Authentication required.', code: 'UNAUTHORIZED' });
    }
  });

  app.decorate(
    'requireRole',
    (...allowedRoles) =>
      async function requireRole(request, reply) {
        const actor = await app.prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { id: true, role: true, isActive: true }
        });
        if (!actor || !actor.isActive) {
          return reply
            .code(401)
            .send({ error: 'Account is unavailable.', code: 'ACCOUNT_UNAVAILABLE' });
        }
        if (!allowedRoles.includes(actor.role)) {
          const error = forbidden();
          return reply
            .code(error.statusCode)
            .send({ error: error.message, code: error.code });
        }
        request.currentRole = actor.role;
      }
  );

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: 'Route not found.', code: 'ROUTE_NOT_FOUND' })
  );

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      Number.isInteger(error.statusCode) &&
      error.statusCode >= 400 &&
      error.statusCode < 600
        ? error.statusCode
        : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error, path: request.url }, 'Unhandled API error');
    }
    if (error.validation) {
      return reply
        .code(400)
        .send({ error: 'Request validation failed.', code: 'VALIDATION_ERROR' });
    }
    if (error.code === 'P2002') {
      return reply.code(409).send({
        error: 'A resource with these details already exists.',
        code: 'CONFLICT'
      });
    }
    if (error.code === 'P2025') {
      return reply
        .code(404)
        .send({ error: 'Resource not found.', code: 'NOT_FOUND' });
    }
    return reply.code(statusCode).send({
      error:
        statusCode >= 500
          ? 'An unexpected server error occurred.'
          : error.message || 'Request failed.',
      code:
        error.code && typeof error.code === 'string' && !/^P\d{4}$/.test(error.code)
          ? error.code
          : 'REQUEST_FAILED'
    });
  });

  app.get('/health', async () => ({ status: 'ok', service: 'billscope-api' }));

  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(accountRoutes, { prefix: '/api/accounts' });
  app.register(transactionRoutes, { prefix: '/api/transactions' });
  app.register(transferRoutes, { prefix: '/api/transfers' });
  app.register(providerRoutes, { prefix: '/api/provider' });
  app.register(billRoutes, { prefix: '/api/bills' });
  app.register(budgetRoutes, { prefix: '/api/budgets' });
  app.register(forecastingRoutes, { prefix: '/api/forecasting' });
  app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  app.register(profileRoutes, { prefix: '/api/profile' });
  app.register(adminRoutes, { prefix: '/api/admin' });
  app.register(fxRoutes, { prefix: '/api/fx' });
  app.register(recurringRoutes, { prefix: '/api/recurring' });
  app.register(financialHealthRoutes, { prefix: '/api/financial-health' });
  app.register(householdRoutes, { prefix: '/api/households' });

  if (!options.prisma) {
    app.addHook('onClose', async () => {
      await prisma.$disconnect();
    });
  }

  return app;
}
