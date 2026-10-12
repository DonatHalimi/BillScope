import { randomUUID, createHash } from 'node:crypto';
import argon2 from 'argon2';
import { AppError } from '../lib/http-errors.js';

const REFRESH_COOKIE = 'billscope_refresh';
const registerSchema = {
  body: {
    type: 'object', additionalProperties: false,
    required: ['firstName', 'lastName', 'email', 'password', 'phone'],
    properties: {
      firstName: { type: 'string', minLength: 1, maxLength: 60 },
      lastName: { type: 'string', minLength: 1, maxLength: 60 },
      email: { type: 'string', format: 'email', maxLength: 254 },
      password: { type: 'string', minLength: 12, maxLength: 128 },
      phone: { type: 'string', minLength: 7, maxLength: 24, pattern: '^\\+?[0-9][0-9() .-]{5,22}$' }
    }
  }
};

const loginSchema = {
  body: {
    type: 'object', additionalProperties: false,
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', maxLength: 254 },
      password: { type: 'string', minLength: 1, maxLength: 128 },
      rememberMe: { type: 'boolean', default: false }
    }
  }
};

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    preferredCurrency: user.preferredCurrency,
    createdAt: user.createdAt
  };
}

function refreshCookieOptions(config, ttlSeconds) {
  return {
    path: '/api/auth',
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    signed: true,
    maxAge: ttlSeconds
  };
}

function clearRefreshCookie(reply, config) {
  reply.clearCookie(REFRESH_COOKIE, {
    path: '/api/auth',
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict'
  });
}

function assertBrowserCookieRequest(request, config) {
  const origin = request.headers.origin;
  const protection = request.headers['x-billscope-client'];
  if (origin !== config.frontendUrl || protection !== 'web') {
    throw new AppError(403, 'Request origin verification failed.', 'ORIGIN_REJECTED');
  }
}

async function createRefreshSession(app, user, request, reply, { familyId = randomUUID(), rememberMe = false, jti = randomUUID(), id = randomUUID() } = {}) {
  const ttlSeconds = rememberMe ? app.config.rememberRefreshTokenTtlSeconds : app.config.refreshTokenTtlSeconds;
  const refreshToken = app.jwt.sign({ sub: user.id, jti, familyId, type: 'refresh' }, { expiresIn: ttlSeconds });
  const now = new Date();
  await app.prisma.refreshToken.create({
    data: {
      id,
      jti,
      tokenHash: hashToken(refreshToken),
      familyId,
      userId: user.id,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      userAgent: String(request.headers['user-agent'] || '').slice(0, 512) || null
    }
  });
  const accessToken = app.jwt.sign({ sub: user.id, role: user.role, type: 'access' }, { expiresIn: app.config.accessTokenTtlSeconds });
  reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(app.config, ttlSeconds));
  return { accessToken, user: publicUser(user) };
}

async function getCookieToken(request) {
  const signed = request.cookies?.[REFRESH_COOKIE];
  if (!signed) return null;
  const result = request.unsignCookie(signed);
  return result.valid ? result.value : null;
}

export async function authRoutes(app) {
  app.post('/register', { schema: registerSchema, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const firstName = request.body.firstName.trim();
    const lastName = request.body.lastName.trim();
    const email = request.body.email.trim().toLowerCase();
    const phone = request.body.phone.trim();
    if (!firstName || !lastName || !email || !phone) throw new AppError(400, 'First name, last name, email, and phone are required.', 'REQUIRED_FIELDS');
    try {
      const passwordHash = await app.passwordService.hash(request.body.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
      const user = await app.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { firstName, lastName, email, phone, passwordHash, role: 'CLIENT', preferredCurrency: 'EUR' }
        });
        await tx.account.create({
          data: { userId: created.id, name: 'Everyday account', institutionName: 'Personal', accountType: 'CHECKING', currency: 'EUR', balance: 0, availableBalance: 0 }
        });
        await tx.account.create({
          data: { userId: created.id, name: 'Savings', institutionName: 'Personal', accountType: 'SAVINGS', currency: 'EUR', balance: 0, availableBalance: 0 }
        });
        return created;
      });
      const session = await createRefreshSession(app, user, request, reply);
      return reply.code(201).send(session);
    } catch (error) {
      if (error?.code === 'P2002') throw new AppError(409, 'An account with this email already exists.', 'EMAIL_EXISTS');
      throw error;
    }
  });

  app.post('/login', { schema: loginSchema, config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request, reply) => {
    const email = request.body.email.trim().toLowerCase();
    const user = await app.prisma.user.findUnique({ where: { email } });
    const hash = user?.passwordHash || app.dummyPasswordHash;
    let passwordIsValid = false;
    try { passwordIsValid = await app.passwordService.verify(hash, request.body.password); } catch { passwordIsValid = false; }
    if (!user || !passwordIsValid || !user.isActive) {
      throw new AppError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
    }
    const session = await createRefreshSession(app, user, request, reply, { rememberMe: request.body.rememberMe === true });
    return reply.send(session);
  });

  app.post('/refresh', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    assertBrowserCookieRequest(request, app.config);
    const token = await getCookieToken(request);
    if (!token) {
      clearRefreshCookie(reply, app.config);
      throw new AppError(401, 'Session expired. Sign in again.', 'REFRESH_MISSING');
    }

    let claims;
    try { claims = app.jwt.verify(token); } catch {
      clearRefreshCookie(reply, app.config);
      throw new AppError(401, 'Session expired. Sign in again.', 'REFRESH_INVALID');
    }
    if (claims.type !== 'refresh' || !claims.jti || !claims.familyId || !claims.sub) {
      clearRefreshCookie(reply, app.config);
      throw new AppError(401, 'Session expired. Sign in again.', 'REFRESH_INVALID');
    }

    const stored = await app.prisma.refreshToken.findUnique({ where: { jti: claims.jti } });
    if (!stored || stored.userId !== claims.sub || stored.familyId !== claims.familyId || stored.tokenHash !== hashToken(token)) {
      clearRefreshCookie(reply, app.config);
      throw new AppError(401, 'Session expired. Sign in again.', 'REFRESH_INVALID');
    }
    if (stored.revokedAt) {
      await app.prisma.refreshToken.updateMany({ where: { familyId: stored.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      clearRefreshCookie(reply, app.config);
      throw new AppError(401, 'Refresh token reuse was detected. Sign in again.', 'REFRESH_REPLAY');
    }
    if (stored.expiresAt <= new Date()) {
      await app.prisma.refreshToken.updateMany({ where: { familyId: stored.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      clearRefreshCookie(reply, app.config);
      throw new AppError(401, 'Session expired. Sign in again.', 'REFRESH_EXPIRED');
    }

    const user = await app.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) {
      await app.prisma.refreshToken.updateMany({ where: { familyId: stored.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      clearRefreshCookie(reply, app.config);
      throw new AppError(401, 'Account is unavailable. Sign in again.', 'ACCOUNT_UNAVAILABLE');
    }

    const ttlSeconds = Math.max(1, Math.floor((stored.expiresAt.getTime() - Date.now()) / 1000));
    const nextJti = randomUUID();
    const nextId = randomUUID();
    const nextToken = app.jwt.sign({ sub: user.id, jti: nextJti, familyId: stored.familyId, type: 'refresh' }, { expiresIn: ttlSeconds });
    const now = new Date();
    try {
      await app.prisma.$transaction(async (tx) => {
        const revoked = await tx.refreshToken.updateMany({ where: { id: stored.id, revokedAt: null }, data: { revokedAt: now, replacedById: nextId } });
        if (revoked.count !== 1) throw new AppError(409, 'Refresh token was already used.', 'REFRESH_REPLAY');
        await tx.refreshToken.create({
          data: {
            id: nextId,
            jti: nextJti,
            tokenHash: hashToken(nextToken),
            familyId: stored.familyId,
            userId: user.id,
            expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
            userAgent: String(request.headers['user-agent'] || '').slice(0, 512) || null
          }
        });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error?.code === 'REFRESH_REPLAY') {
        await app.prisma.refreshToken.updateMany({ where: { familyId: stored.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        clearRefreshCookie(reply, app.config);
      }
      throw error;
    }

    const accessToken = app.jwt.sign({ sub: user.id, role: user.role, type: 'access' }, { expiresIn: app.config.accessTokenTtlSeconds });
    const remainingTtl = Math.max(1, Math.floor((stored.expiresAt.getTime() - Date.now()) / 1000));
    reply.setCookie(REFRESH_COOKIE, nextToken, refreshCookieOptions(app.config, remainingTtl));
    return reply.send({ accessToken, user: publicUser(user) });
  });

  app.post('/logout', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    assertBrowserCookieRequest(request, app.config);
    const token = await getCookieToken(request);
    if (token) {
      try {
        const claims = app.jwt.verify(token);
        if (claims.type === 'refresh' && claims.familyId) {
          await app.prisma.refreshToken.updateMany({ where: { familyId: claims.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        }
      } catch {
        // A malformed or expired cookie is cleared without exposing token validation details.
      }
    }
    clearRefreshCookie(reply, app.config);
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const user = await app.prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user || !user.isActive) throw new AppError(401, 'Session is no longer valid.', 'SESSION_INVALID');
    return { user: publicUser(user) };
  });
}

export { REFRESH_COOKIE, publicUser, hashToken };
