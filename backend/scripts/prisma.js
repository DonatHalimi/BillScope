import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(backendRoot, '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
const executable = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
const args = process.argv.slice(2);
const isMigration = args[0] === 'migrate' && ['dev', 'deploy', 'reset', 'resolve', 'diff'].includes(args[1]);
const cliEnv = { ...process.env };
if (isMigration && process.env.MIGRATION_DATABASE_URL) cliEnv.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;

const result = spawnSync(executable, args, { cwd: backendRoot, env: cliEnv, stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) {
  console.error(`Could not start Prisma CLI: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
