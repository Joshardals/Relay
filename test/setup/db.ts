/**
 * Setup for Vitest's "db" project (`server/application/**`) — M0.
 *
 * Per BACKEND_ROADMAP.md §12 the application layer is tested against a
 * real Postgres, not mocked repositories. This file's only job for now is
 * to fail loudly and early if `DATABASE_URL_TEST` is missing, instead of
 * letting an M3 test hit a confusing Prisma connection error.
 *
 * Deliberately a different variable from `DATABASE_URL`: these tests will
 * truncate tables, and must never be able to point at a dev/prod database
 * through a copied `.env`. The reset strategy (truncate vs. rollback per
 * test) is M3's decision.
 */
if (!process.env.DATABASE_URL_TEST) {
  throw new Error(
    'DATABASE_URL_TEST is not set. The "db" Vitest project ' +
      "(server/application/**) runs against a real Postgres test " +
      "database. Set it (e.g. in .env.test) before `npm run test:db`.",
  );
}
