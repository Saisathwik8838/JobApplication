import { Queue } from 'bullmq';
export const queueNames = ['job-discovery', 'job-deduplication', 'job-parsing', 'eligibility-check', 'ai-matching', 'resume-generation', 'application-generation', 'browser-application', 'notification'];
/** @param {import('ioredis').default} connection */
export function createQueues(connection) { return Object.fromEntries(queueNames.map((name) => [name, new Queue(name, { connection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnFail: false, removeOnComplete: 1000 } })])); }
/** @param {ReturnType<typeof createQueues>} queues */
export async function scheduleDiscovery(queues) { await queues['job-discovery'].upsertJobScheduler('morning-full-discovery', { pattern: '0 8 * * *' }, { name: 'discover', data: { mode: 'full', idempotencyKey: 'scheduled-morning' } }); await queues['job-discovery'].upsertJobScheduler('incremental-discovery', { pattern: '0 */4 * * *' }, { name: 'discover', data: { mode: 'incremental', idempotencyKey: 'scheduled-incremental' } }); }
