import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Setup for Vitest's "components" project (jsdom) — TESTING_MILESTONES.md M0.
 *
 * `@testing-library/jest-dom/vitest` is the entry built for Vitest: it
 * extends Vitest's own imported `expect`, so no `globals: true` is needed.
 * That matters because this config deliberately leaves globals off (the
 * repo's Playwright spec imports `test`/`expect` explicitly too).
 *
 * Consequence: RTL's automatic `afterEach(cleanup)` only registers when a
 * global `afterEach` exists, so it is registered explicitly here instead.
 */
afterEach(cleanup);
