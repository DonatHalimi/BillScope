import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: rootEnv });

export function getConfig(overrides = {}) {
  const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    host: process.env.API_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.API_PORT || '5000', 10),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    databaseUrl: process.env.DATABASE_URL || '',
    jwtSecret: process.env.JWT_SECRET || '',
    cookieSecret: process.env.COOKIE_SECRET || '',
    auditLogSecret: process.env.AUDIT_LOG_SECRET || '',
    accessTokenTtlSeconds: Number.parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS || '600', 10),
    refreshTokenTtlSeconds: Number.parseInt(process.env.REFRESH_TOKEN_TTL_SECONDS || '604800', 10),
    rememberRefreshTokenTtlSeconds: Number.parseInt(process.env.REMEMBER_REFRESH_TOKEN_TTL_SECONDS || '2592000', 10),
    ...overrides
  };

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('API_PORT must be a valid TCP port.');
  }
  if (!config.frontendUrl.startsWith('http://') && !config.frontendUrl.startsWith('https://')) {
    throw new Error('FRONTEND_URL must be an absolute HTTP(S) origin.');
  }
  if (config.nodeEnv !== 'test') {
    if (!config.databaseUrl) throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.');
    for (const [name, value] of [
      ['ACCESS_TOKEN_TTL_SECONDS', config.accessTokenTtlSeconds],
      ['REFRESH_TOKEN_TTL_SECONDS', config.refreshTokenTtlSeconds],
      ['REMEMBER_REFRESH_TOKEN_TTL_SECONDS', config.rememberRefreshTokenTtlSeconds]
    ]) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 60 * 60 * 24 * 365) throw new Error(`${name} must be a positive whole number no greater than one year.`);
    }
    if (config.refreshTokenTtlSeconds > config.rememberRefreshTokenTtlSeconds) throw new Error('Remember-me sessions must be at least as long as standard sessions.');
    if (config.jwtSecret === config.cookieSecret) throw new Error('JWT_SECRET and COOKIE_SECRET must be different secrets.');
    if (Buffer.byteLength(config.jwtSecret) < 32 || /replace-with|change-me|example/i.test(config.jwtSecret)) {
      throw new Error('JWT_SECRET must be replaced with at least 32 bytes of unique random data.');
    }
    if (Buffer.byteLength(config.cookieSecret) < 32 || /replace-with|change-me|example/i.test(config.cookieSecret)) {
      throw new Error('COOKIE_SECRET must be replaced with at least 32 bytes of different random data.');
    }
    if (Buffer.byteLength(config.auditLogSecret) < 32 || /replace-with|change-me|example/i.test(config.auditLogSecret)) {
      throw new Error('AUDIT_LOG_SECRET must be replaced with at least 32 bytes of unique random data.');
    }
    if ([config.jwtSecret, config.cookieSecret].includes(config.auditLogSecret)) {
      throw new Error('AUDIT_LOG_SECRET must differ from JWT_SECRET and COOKIE_SECRET.');
    }
  }
  return config;
}
