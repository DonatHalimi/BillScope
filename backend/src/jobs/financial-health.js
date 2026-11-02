import { getPrismaClient, disconnectPrisma } from '../db/prisma.js';
import { getFinancialHealthDashboard, recomputeFinancialHealth } from '../services/financial-health.js';

const prisma = getPrismaClient();
const concurrency = 5;

async function processUser(user) {
  await recomputeFinancialHealth({ prisma, log: console }, user.id);
  await getFinancialHealthDashboard({ prisma, log: console }, user.id);
}

async function main() {
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true }, orderBy: { id: 'asc' } });
  let cursor = 0;
  let failed = 0;
  const workers = Array.from({ length: Math.min(concurrency, users.length) }, async () => {
    while (cursor < users.length) {
      const user = users[cursor++];
      try {
        await processUser(user);
        console.info(`Financial health refreshed for user ${user.id}`);
      } catch (error) {
        failed += 1;
        console.error(`Financial health refresh failed for user ${user.id}: ${error.message}`);
      }
    }
  });
  await Promise.all(workers);
  console.info(`Financial health job finished: ${users.length - failed}/${users.length} users processed.`);
  if (failed) process.exitCode = 1;
}

try {
  await main();
} finally {
  await disconnectPrisma();
}
