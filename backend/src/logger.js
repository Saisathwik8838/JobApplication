import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.apiKey', '*.email', '*.phone'], censor: '[REDACTED]' },
  base: { service: 'job-application-agent' }
});
