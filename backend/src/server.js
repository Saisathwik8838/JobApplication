import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

import { loadConfig } from './config/config.js';
import { logger } from './logger.js';
import { loadCandidateProfile } from './modules/candidate/profileRepository.js';
import { getLLMProvider } from './modules/ai/providerFactory.js';
import { createQueues, scheduleDiscovery } from './queues/queues.js';
import { createApp } from './app.js';

const config = loadConfig();

const prisma = new PrismaClient();

const connection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

let profilePath = resolve(
  process.cwd(),
  config.PROFILE_PATH,
);
if (!existsSync(profilePath)) {
  const alternate = resolve(process.cwd(), config.PROFILE_PATH.replace(/^\.\.\//, ''));
  if (existsSync(alternate)) profilePath = alternate;
}

const { profile, version: profileVersion } =
  await loadCandidateProfile(profilePath);

let masterResumePath = resolve(dirname(profilePath), 'resume', 'master_resume.md');
if (!existsSync(masterResumePath)) {
  const fallback = resolve(process.cwd(), '..', 'profile', 'resume', 'master_resume.md');
  if (existsSync(fallback)) masterResumePath = fallback;
}

import { hashPassword } from './modules/auth/authService.js';

const queues = createQueues(connection);

try {
  const defaultUser = await prisma.user.findUnique({ where: { id: 'default-local-user' } });
  if (defaultUser && !defaultUser.passwordHash) {
    const defaultHash = await hashPassword('password123');
    await prisma.user.update({
      where: { id: 'default-local-user' },
      data: { passwordHash: defaultHash, name: 'Cheera Sai Sathwik' },
    });
  }
} catch (err) {
  logger.warn({ err }, 'Could not ensure default user password');
}

await scheduleDiscovery(queues);

const provider = getLLMProvider({
  ...config,
  logger,
});

const app = createApp({
  prisma,
  queues,
  profile,
  profileVersion,
  profilePath,
  masterResumePath,
  readMasterResume: () => readFile(masterResumePath, 'utf8'),
  provider,
  logger,
  config,
  //sources: [],
});

const server = app.listen(
  config.PORT,
  () => logger.info({ port: config.PORT }, 'API listening'),
);

async function close() {
  await server.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
