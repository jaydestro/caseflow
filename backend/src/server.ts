import { createApp } from './app';
import { getRepositories } from './data';
import { config } from './lib/config';
import { logger } from './lib/logger';
import { runSeedIfEmpty } from './scripts/seed';

async function main() {
  const repos = await getRepositories();
  await runSeedIfEmpty(repos);
  const app = createApp();
  app.listen(config.port, () => {
    logger.info(
      { port: config.port },
      'CaseFlow API listening',
    );
  });
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
