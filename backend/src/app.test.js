import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { createPrismaMock, createTestConfig, createUserFactory } from './tests/factories.js';

const passwordService = {
  hash: vi.fn(async () => 'argon-test-hash'),
  verify: vi.fn(async (hash, password) => hash === 'argon-test-hash' && password === 'Long-test-password#2026')
};
const dummyHash = 'argon-test-hash';
let apps = [];

async function createApp(prisma = createPrismaMock()) {
  const app = await buildApp({ prisma, config: createTestConfig(), passwordService, dummyPasswordHash: dummyHash });
  apps.push(app);
  await app.ready();
  return { app, prisma };
}

afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
  vi.clearAllMocks();
});

describe('BillScope HTTP integration', () => {
  it('exposes a basic liveness health check', async () => {
    const { app } = await createApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'billscope-api' });
  });

  it('requires all five registration fields and enforces password length', async () => {
    const { app } = await createApp();
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.test', password: 'short' } });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
  });

  it('registers a client, creates starter accounts, and returns an access token', async () => {
    const prisma = createPrismaMock();
    prisma.user.create.mockImplementation(async ({ data }) => createUserFactory(data));
    const { app } = await createApp(prisma);
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { firstName: 'Alex', lastName: 'Morgan', email: 'Alex@example.test', password: 'Long-test-password#2026', phone: '+38344123456' }
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().accessToken).toEqual(expect.any(String));
    expect(response.json().user).toMatchObject({ firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.test', role: 'CLIENT', preferredCurrency: 'EUR' });
    expect(response.json().user.passwordHash).toBeUndefined();
    expect(prisma.account.create).toHaveBeenCalledTimes(2);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('Path=/api/auth');
  });

  it('rejects access to protected endpoints without a bearer token', async () => {
    const { app } = await createApp();
    const response = await app.inject({ method: 'GET', url: '/api/accounts' });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('UNAUTHORIZED');
  });

  it('enforces server-side role checks on the admin API', async () => {
    const prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue(createUserFactory({ id: 'user-test-001', role: 'CLIENT' }));
    const { app } = await createApp(prisma);
    const token = app.jwt.sign({ sub: 'user-test-001', role: 'ADMIN', type: 'access' }, { expiresIn: 60 });
    const response = await app.inject({ method: 'GET', url: '/api/admin/overview', headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('FORBIDDEN');
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('exposes deterministic rule-based category suggestions to authenticated users', async () => {
    const prisma = createPrismaMock();
    const { app } = await createApp(prisma);
    const token = app.jwt.sign({ sub: 'user-test-001', role: 'CLIENT', type: 'access' }, { expiresIn: 60 });
    const response = await app.inject({
      method: 'GET', url: '/api/transactions/category-suggestion?description=Spotify%20subscription',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ category: 'Subscriptions', method: 'rules' });
  });
});
