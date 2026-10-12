import { buildApp } from './app.js';
import { getConfig } from './config.js';

const config = getConfig();
const app = await buildApp({ config });

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`BillScope API listening at http://${config.host}:${config.port}`);
} catch (error) {
  app.log.error(error, 'Failed to start BillScope API');
  await app.close();
  process.exitCode = 1;
}
