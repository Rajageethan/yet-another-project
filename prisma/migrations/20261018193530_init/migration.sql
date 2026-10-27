-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "year" TEXT,
    "goal" TEXT,
    "language" TEXT NOT NULL DEFAULT 'python',
    "level" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "groqKeyEnc" TEXT,
    "mentorInterrupt" BOOLEAN NOT NULL DEFAULT true,
    "guidanceStyle" TEXT NOT NULL DEFAULT 'balanced',
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "freezes" INTEGER NOT NULL DEFAULT 0,
    "lastSolvedDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TopicMastery" (
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "selfRating" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "topic"),
    CONSTRAINT "TopicMastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'new',
    "swapped" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DailyAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'understand',
    "status" TEXT NOT NULL DEFAULT 'active',
    "code" TEXT NOT NULL DEFAULT '',
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "pasteFlags" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '',
    "summarizedCount" INTEGER NOT NULL DEFAULT 0,
    "lastMentorCode" TEXT NOT NULL DEFAULT '',
    "lastInterruptAt" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "solvedAt" DATETIME,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CodeSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "pasted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CodeSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assessment" (
    "sessionId" TEXT NOT NULL PRIMARY KEY,
    "understanding" INTEGER NOT NULL,
    "edgeCases" INTEGER NOT NULL,
    "approach" INTEGER NOT NULL,
    "complexity" INTEGER NOT NULL,
    "correctness" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "thinkingScore" INTEGER NOT NULL,
    "wentWell" TEXT NOT NULL,
    "workOn" TEXT NOT NULL,
    "keyInsight" TEXT,
    "patternName" TEXT,
    "patternCard" TEXT,
    "complexityStr" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assessment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewSchedule" (
    "userId" TEXT NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,

    PRIMARY KEY ("userId", "problemSlug"),
    CONSTRAINT "ReviewSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UsageDay" (
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "turns" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("userId", "date"),
    CONSTRAINT "UsageDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DailyAssignment_userId_date_key" ON "DailyAssignment"("userId", "date");

-- CreateIndex
CREATE INDEX "Session_userId_date_idx" ON "Session"("userId", "date");

-- CreateIndex
CREATE INDEX "Message_sessionId_createdAt_idx" ON "Message"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "CodeSnapshot_sessionId_createdAt_idx" ON "CodeSnapshot"("sessionId", "createdAt");
