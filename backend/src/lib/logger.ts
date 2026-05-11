import pino from 'pino';

export const logger = pino({
  base: { service: 'caseflow-api' },
  level: process.env.LOG_LEVEL ?? 'info',
});
