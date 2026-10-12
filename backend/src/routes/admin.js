import { AppError } from '../lib/http-errors.js';

export async function adminRoutes(app) {
  app.get('/overview', { preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async () => {
    const [users, activeUsers, accounts, transactions, connections] = await Promise.all([
      app.prisma.user.count(),
      app.prisma.user.count({ where: { isActive: true } }),
      app.prisma.account.count({ where: { isArchived: false } }),
      app.prisma.transaction.count(),
      app.prisma.bankConnection.count()
    ]);
    return { overview: { users, activeUsers, accounts, transactions, bankConnections: connections } };
  });

  app.get('/users', { preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit || '50', 10) || 50));
    const offset = Math.max(0, Number.parseInt(request.query.offset || '0', 10) || 0);
    const search = String(request.query.search || '').trim().slice(0, 100);
    const where = search ? {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } }
      ]
    } : {};
    const [items, total] = await Promise.all([
      app.prisma.user.findMany({ where, take: limit, skip: offset, orderBy: { createdAt: 'desc' }, select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, role: true, isActive: true, preferredCurrency: true, createdAt: true
      } }),
      app.prisma.user.count({ where })
    ]);
    return { users: items, total, limit, offset };
  });

  app.patch('/users/:id/role', {
    preHandler: [app.authenticate, app.requireRole('ADMIN')],
    schema: { body: { type: 'object', additionalProperties: false, required: ['role'], properties: { role: { type: 'string', enum: ['CLIENT', 'PROVIDER', 'ADMIN'] } } } }
  }, async (request) => {
    if (request.params.id === request.user.sub) throw new AppError(400, 'Administrators cannot change their own role.', 'SELF_ROLE_CHANGE_BLOCKED');
    const target = await app.prisma.user.findUnique({ where: { id: request.params.id }, select: { id: true, role: true } });
    if (!target) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
    if (target.role === 'ADMIN' && request.body.role !== 'ADMIN') {
      const adminCount = await app.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (adminCount <= 1) throw new AppError(409, 'The last active administrator cannot be demoted.', 'LAST_ADMIN');
    }
    const user = await app.prisma.user.update({ where: { id: target.id }, data: { role: request.body.role }, select: {
      id: true, firstName: true, lastName: true, email: true, role: true, isActive: true
    } });
    return { user };
  });

  app.patch('/users/:id/status', {
    preHandler: [app.authenticate, app.requireRole('ADMIN')],
    schema: { body: { type: 'object', additionalProperties: false, required: ['isActive'], properties: { isActive: { type: 'boolean' } } } }
  }, async (request) => {
    if (request.params.id === request.user.sub && !request.body.isActive) throw new AppError(400, 'Administrators cannot deactivate their own account.', 'SELF_DEACTIVATION_BLOCKED');
    const target = await app.prisma.user.findUnique({ where: { id: request.params.id }, select: { id: true, role: true, isActive: true } });
    if (!target) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
    if (target.role === 'ADMIN' && target.isActive && !request.body.isActive) {
      const adminCount = await app.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (adminCount <= 1) throw new AppError(409, 'The last active administrator cannot be deactivated.', 'LAST_ADMIN');
    }
    const user = await app.prisma.user.update({ where: { id: target.id }, data: { isActive: request.body.isActive }, select: {
      id: true, firstName: true, lastName: true, email: true, role: true, isActive: true
    } });
    if (!request.body.isActive) {
      await app.prisma.refreshToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return { user };
  });
}
