-- Student state the mentor keeps in mind (src/lib/mentor/state.ts)
ALTER TABLE "Session" ADD COLUMN "studentState" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Session" ADD COLUMN "pasteUnexplained" BOOLEAN NOT NULL DEFAULT false;
