import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * TESTING_MILESTONES.md M0 — three Vitest projects, because this repo has
 * three genuinely different test environments:
 *
 *   unit        plain Node, no DOM/DB: server/domain, server/validation,
 *               server/realtime, server/auth/{jwt,password,tokens}, lib/*
 *   components  jsdom + React Testing Library: components/**, plus
 *               lib/use-now.ts (a hook, so it needs renderHook + fake timers)
 *   db          plain Node against a real test Postgres: server/application/**
 *               (opt-in via `npm run test:db`, see test/setup/db.ts)
 *
 * `resolve.tsconfigPaths` is Vite's native support for the `@/*` alias, so
 * no extra plugin is needed. This file is `.mts` because package.json has
 * no `"type": "module"`, and a bare `.ts` config triggers a CJS/ESM warning.
 *
 * `passWithNoTests` is a ROOT-level option: set inside a project it has no
 * effect, and `npm test` exits 1 while no test files exist yet.
 */
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "unit",
          environment: "node",
          include: [
            "server/domain/**/*.test.ts",
            "server/validation/**/*.test.ts",
            "server/realtime/**/*.test.ts",
            "server/auth/{jwt,password,tokens}.test.ts",
            "lib/**/*.test.ts",
          ],
          exclude: ["lib/use-now.test.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { tsconfigPaths: true },
        test: {
          name: "components",
          environment: "jsdom",
          setupFiles: ["./test/setup/jsdom.ts"],
          include: ["components/**/*.test.{ts,tsx}", "lib/use-now.test.ts"],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "db",
          environment: "node",
          setupFiles: ["./test/setup/db.ts"],
          include: ["server/application/**/*.test.ts"],
        },
      },
    ],
  },
});
