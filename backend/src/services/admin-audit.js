import { createHmac } from 'node:crypto';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

function hmac(secret, value) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function secretFor(app) {
  return app.config.auditLogSecret || app.config.jwtSecret;
}

export async function acquireAdminAuditLock(tx) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(641278301)`;
}

export async function recordAdminAudit(app, tx, request, event) {
  await acquireAdminAuditLock(tx);
  const last = await tx.adminAuditLog.findFirst({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { currentHash: true, createdAt: true }
  });
  const previousHash = last?.currentHash || 'GENESIS';
  const now = new Date();
  const createdAt = last?.createdAt && last.createdAt >= now ? new Date(last.createdAt.getTime() + 1) : now;
  const metadata = stableValue(event.metadata || {});
  const fields = {
    actorUserId: request.user.sub,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata,
    previousHash,
    createdAt: createdAt.toISOString()
  };
  const currentHash = hmac(secretFor(app), JSON.stringify(fields));
  const ipHash = request.ip ? hmac(secretFor(app), `ip:${request.ip}`) : null;
  const userAgentHash = request.headers['user-agent'] ? hmac(secretFor(app), `ua:${String(request.headers['user-agent']).slice(0, 512)}`) : null;
  return tx.adminAuditLog.create({
    data: {
      ...fields,
      metadata,
      ipHash,
      userAgentHash,
      currentHash,
      createdAt: new Date(fields.createdAt)
    }
  });
}

export function verifyAuditChain(rows, secret) {
  let expectedPreviousHash = 'GENESIS';
  const errors = [];
  for (const row of rows) {
    if (row.previousHash !== expectedPreviousHash) errors.push({ id: row.id, issue: 'PREVIOUS_HASH_MISMATCH' });
    const fields = {
      actorUserId: row.actorUserId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: stableValue(row.metadata || {}),
      previousHash: row.previousHash,
      createdAt: new Date(row.createdAt).toISOString()
    };
    const expectedHash = hmac(secret, JSON.stringify(fields));
    if (expectedHash !== row.currentHash) errors.push({ id: row.id, issue: 'CURRENT_HASH_MISMATCH' });
    expectedPreviousHash = row.currentHash;
  }
  return { valid: errors.length === 0, checked: rows.length, errors };
}

export function auditHashSecret(app) {
  return secretFor(app);
}
