-- Remove the "swap today's problem" feature: drop DailyAssignment.swapped
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'new',
    CONSTRAINT "DailyAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DailyAssignment" ("date", "id", "kind", "problemSlug", "userId") SELECT "date", "id", "kind", "problemSlug", "userId" FROM "DailyAssignment";
DROP TABLE "DailyAssignment";
ALTER TABLE "new_DailyAssignment" RENAME TO "DailyAssignment";
CREATE UNIQUE INDEX "DailyAssignment_userId_date_key" ON "DailyAssignment"("userId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
