import { AppError } from './http-errors.js';

export async function withHouseholdTenant(prisma, userId, callback, options = {}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return callback(tx);
  }, { isolationLevel: options.isolationLevel || 'Serializable' });
}

export async function requireHouseholdMember(tx, householdId, userId) {
  const membership = await tx.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
    select: { id: true, householdId: true, userId: true, role: true }
  });
  if (!membership) throw new AppError(404, 'Household not found.', 'HOUSEHOLD_NOT_FOUND');
  return membership;
}

export function requireHouseholdRole(membership, roles) {
  if (!roles.includes(membership.role)) throw new AppError(403, 'Your household role does not allow this action.', 'HOUSEHOLD_FORBIDDEN');
}

export function notifyHousehold(app, householdId, event, data = {}) {
  const clients = app.householdSockets?.get(householdId);
  if (!clients?.size) return;
  const message = JSON.stringify({ type: event, householdId, data, sentAt: new Date().toISOString() });
  for (const socket of clients) {
    if (socket.readyState !== 1) {
      clients.delete(socket);
      continue;
    }
    try { socket.send(message); } catch { clients.delete(socket); }
  }
  if (!clients.size) app.householdSockets.delete(householdId);
}
