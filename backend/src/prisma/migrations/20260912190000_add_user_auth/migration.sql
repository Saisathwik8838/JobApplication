-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- AlterTable Candidate
ALTER TABLE "Candidate" ADD COLUMN "userId" TEXT,
ADD COLUMN "masterResume" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_userId_key" ON "Candidate"("userId");

-- AlterTable JobMatch
ALTER TABLE "JobMatch" ADD COLUMN "userId" TEXT;
CREATE INDEX "JobMatch_userId_idx" ON "JobMatch"("userId");

-- AlterTable Application
ALTER TABLE "Application" DROP CONSTRAINT IF EXISTS "Application_jobId_key";
ALTER TABLE "Application" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Application_jobId_userId_key" ON "Application"("jobId", "userId");
CREATE INDEX "Application_userId_idx" ON "Application"("userId");

-- AlterTable UserApproval
ALTER TABLE "UserApproval" ADD COLUMN "userId" TEXT;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApproval" ADD CONSTRAINT "UserApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill default user for any existing unlinked data
INSERT INTO "User" ("id", "email", "name", "updatedAt")
VALUES ('default-local-user', 'user@example.com', 'Candidate', CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;

UPDATE "Candidate" SET "userId" = 'default-local-user' WHERE "userId" IS NULL;
UPDATE "Application" SET "userId" = 'default-local-user' WHERE "userId" IS NULL;
UPDATE "JobMatch" SET "userId" = 'default-local-user' WHERE "userId" IS NULL;
UPDATE "UserApproval" SET "userId" = 'default-local-user' WHERE "userId" IS NULL;
