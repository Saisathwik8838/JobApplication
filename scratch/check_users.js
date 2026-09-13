import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const users = await p.user.findMany();
console.log('USERS:', users);
const resumes = await p.resumeVersion.findMany();
console.log('RESUME VERSIONS:', resumes.length);
await p.$disconnect();
