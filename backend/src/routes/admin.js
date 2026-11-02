import { AppError } from '../lib/http-errors.js';
import { acquireAdminAuditLock, recordAdminAudit, verifyAuditChain, auditHashSecret } from '../services/admin-audit.js';

const adminPreHandler = (app) => [app.authenticate, app.requireRole('ADMIN')];

function escapeCsv(value) {
  const text = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${String(safe).replace(/"/g, '""')}"`;
}

function auditWhere(query) {
  const where = {};
  if (query.action) where.action = query.action;
  if (query.targetType) where.targetType = query.targetType;
  if (query.targetId) where.targetId = query.targetId;
  if (query.actorUserId) where.actorUserId = query.actorUserId;
  if (query.from || query.to) where.createdAt = { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) };
  return where;
}

function auditSelection() {
  return {
    id: true, actorUserId: true, action: true, targetType: true, targetId: true, metadata: true,
    ipHash: true, userAgentHash: true, previousHash: true, currentHash: true, createdAt: true,
    actor: { select: { id: true, firstName: true, lastName: true, email: true } }
  };
}

function csvRow(row) {
  return [row.id, row.createdAt.toISOString(), row.action, row.actorUserId, row.actor?.email, row.targetType, row.targetId,
    row.metadata, row.ipHash, row.userAgentHash, row.previousHash, row.currentHash].map(escapeCsv).join(',');
}

export async function adminRoutes(app) {
  app.get('/overview', { preHandler: adminPreHandler(app) }, async () => {
    const [users, activeUsers, accounts, transactions, connections] = await Promise.all([
      app.prisma.user.count(),
      app.prisma.user.count({ where: { isActive: true } }),
      app.prisma.account.count({ where: { isArchived: false } }),
      app.prisma.transaction.count(),
      app.prisma.bankConnection.count()
    ]);
    return { overview: { users, activeUsers, accounts, transactions, bankConnections: connections } };
  });

  app.get('/users', { preHandler: adminPreHandler(app) }, async (request) => {
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
    preHandler: adminPreHandler(app),
    schema: { body: { type: 'object', additionalProperties: false, required: ['role'], properties: { role: { type: 'string', enum: ['CLIENT', 'PROVIDER', 'ADMIN'] } } } }
  }, async (request) => {
    if (request.params.id === request.user.sub) throw new AppError(400, 'Administrators cannot change their own role.', 'SELF_ROLE_CHANGE_BLOCKED');
    return app.prisma.$transaction(async (tx) => {
      await acquireAdminAuditLock(tx);
      const target = await tx.user.findUnique({ where: { id: request.params.id }, select: { id: true, role: true } });
      if (!target) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
      if (target.role === request.body.role) return { user: { ...target } };
      if (target.role === 'ADMIN' && request.body.role !== 'ADMIN') {
        const adminCount = await tx.user.count({ where: { role: 'ADMIN', isActive: true } });
        if (adminCount <= 1) throw new AppError(409, 'The last active administrator cannot be demoted.', 'LAST_ADMIN');
      }
      const user = await tx.user.update({ where: { id: target.id }, data: { role: request.body.role }, select: {
        id: true, firstName: true, lastName: true, email: true, role: true, isActive: true
      } });
      await recordAdminAudit(app, tx, request, {
        action: 'USER_ROLE_CHANGED', targetType: 'User', targetId: target.id,
        metadata: { previousRole: target.role, nextRole: request.body.role }
      });
      return { user };
    }, { isolationLevel: 'ReadCommitted' });
  });

  app.patch('/users/:id/status', {
    preHandler: adminPreHandler(app),
    schema: { body: { type: 'object', additionalProperties: false, required: ['isActive'], properties: { isActive: { type: 'boolean' } } } }
  }, async (request) => {
    if (request.params.id === request.user.sub && !request.body.isActive) throw new AppError(400, 'Administrators cannot deactivate their own account.', 'SELF_DEACTIVATION_BLOCKED');
    return app.prisma.$transaction(async (tx) => {
      await acquireAdminAuditLock(tx);
      const target = await tx.user.findUnique({ where: { id: request.params.id }, select: { id: true, role: true, isActive: true } });
      if (!target) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
      if (target.isActive === request.body.isActive) {
        const user = await tx.user.findUnique({ where: { id: target.id }, select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true } });
        return { user };
      }
      if (target.role === 'ADMIN' && target.isActive && !request.body.isActive) {
        const adminCount = await tx.user.count({ where: { role: 'ADMIN', isActive: true } });
        if (adminCount <= 1) throw new AppError(409, 'The last active administrator cannot be deactivated.', 'LAST_ADMIN');
      }
      const user = await tx.user.update({ where: { id: target.id }, data: { isActive: request.body.isActive }, select: {
        id: true, firstName: true, lastName: true, email: true, role: true, isActive: true
      } });
      if (!request.body.isActive) await tx.refreshToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await recordAdminAudit(app, tx, request, {
        action: 'USER_STATUS_CHANGED', targetType: 'User', targetId: target.id,
        metadata: { previousIsActive: target.isActive, nextIsActive: request.body.isActive }
      });
      return { user };
    }, { isolationLevel: 'ReadCommitted' });
  });

  app.get('/audit-logs', {
    preHandler: adminPreHandler(app),
    schema: { querystring: { type: 'object', additionalProperties: false, properties: {
      action: { type: 'string', maxLength: 80 }, targetType: { type: 'string', maxLength: 80 }, targetId: { type: 'string', maxLength: 100 },
      actorUserId: { type: 'string', maxLength: 80 }, from: { type: 'string', format: 'date-time' }, to: { type: 'string', format: 'date-time' },
      limit: { type: 'integer', minimum: 1, maximum: 100 }, offset: { type: 'integer', minimum: 0, maximum: 1000000 }
    } } }
  }, async (request) => {
    const where = auditWhere(request.query);
    const limit = request.query.limit || 50;
    const offset = request.query.offset || 0;
    const [items, total] = await Promise.all([
      app.prisma.adminAuditLog.findMany({ where, take: limit, skip: offset, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: auditSelection() }),
      app.prisma.adminAuditLog.count({ where })
    ]);
    return { auditLogs: items, total, limit, offset };
  });

  app.get('/audit-logs/verify', { preHandler: adminPreHandler(app), config: { rateLimit: { max: 4, timeWindow: '1 minute' } } }, async () => {
    const rows = await app.prisma.adminAuditLog.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: {
      id: true, actorUserId: true, action: true, targetType: true, targetId: true, metadata: true, previousHash: true, currentHash: true, createdAt: true
    } });
    const result = verifyAuditChain(rows, auditHashSecret(app));
    return { integrity: result };
  });

  app.get('/audit-logs/export.csv', {
    preHandler: adminPreHandler(app),
    schema: { querystring: { type: 'object', additionalProperties: false, properties: {
      action: { type: 'string', maxLength: 80 }, targetType: { type: 'string', maxLength: 80 }, targetId: { type: 'string', maxLength: 100 },
      actorUserId: { type: 'string', maxLength: 80 }, from: { type: 'string', format: 'date-time' }, to: { type: 'string', format: 'date-time' },
      limit: { type: 'integer', minimum: 1, maximum: 1000 }
    } } }
  }, async (request, reply) => {
    if (request.query.from && request.query.to && new Date(request.query.from) > new Date(request.query.to)) throw new AppError(400, 'The start date must not be after the end date.', 'INVALID_DATE_RANGE');
    const filters = { ...request.query };
    await app.prisma.$transaction(async (tx) => recordAdminAudit(app, tx, request, {
      action: 'AUDIT_LOG_EXPORTED', targetType: 'AdminAuditLog', targetId: 'filtered-export',
      metadata: { filters, format: 'csv' }
    }), { isolationLevel: 'Serializable' });
    const rows = await app.prisma.adminAuditLog.findMany({ where: auditWhere(request.query), take: Math.min(request.query.limit || 1000, 1000), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: auditSelection() });
    const headers = ['id', 'createdAt', 'action', 'actorUserId', 'actorEmail', 'targetType', 'targetId', 'metadata', 'ipHash', 'userAgentHash', 'previousHash', 'currentHash'];
    const csv = [headers.map(escapeCsv).join(','), ...rows.map(csvRow)].join('\r\n');
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff').header('Content-Disposition', 'attachment; filename="billscope-admin-audit.csv"');
    return reply.type('text/csv; charset=utf-8').send(csv);
  });
}
