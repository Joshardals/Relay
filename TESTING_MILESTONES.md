# Vitest + RTL — TODO

No code yet. This is the plan, written the same way
STREAMING_SSR_TODO.md was: so it survives a session ending mid-work,
and so whoever picks up any one milestone doesn't have to re-derive
why it's scoped the way it is.

## Starting point: this isn't a blank slate

BACKEND_ROADMAP.md already has a "Testing, running throughout (not a
final phase)" section (§12) with a table assigning each layer a tool:

| Layer | Tool | Covers |
|---|---|---|
| Domain | Vitest | Status-transition rules, invariants — pure functions |
| Application/use-case | Vitest + real test Postgres | Validation → authorization → persistence → activity record, incl. version-conflict path |
| Realtime | Manual + thin integration test | A committed mutation emits the expected broadcast event shape |
| End-to-end | Playwright, two browser contexts | §41's acceptance test |

That table was written at Milestone 3 and never operationalized —
there's no `vitest` in `package.json`, no test files anywhere except
`e2e/ticket-realtime.spec.ts`. So this isn't a competing plan; it's
catching up on a documented intention, plus one extension the table
never addressed at all: **component-level testing.** Every `*View`,
every dashboard panel, every modal, every shared UI primitive
(`SelectField`, `Modal`, `FilterPill`, ...) has real branching logic —
filter/search behavior, loading/error/empty states, the sort order in
`TeamView`/`PresenceRail` — with zero coverage and no row in that
table. RTL fills that gap. Everything below either follows a row of
that table or explicitly extends past it; nowhere does it contradict
one.

## The boundary this plan doesn't cross: e2e already exists

`e2e/ticket-realtime.spec.ts` (567 lines) already covers, against a
real browser + real Postgres + real Supabase Realtime, two browser
contexts, no reload: ticket creation/assignment, incident
creation/impact/response/recovery, service degradation, presence, and
disconnect/reconnect/reconcile. That's the actual multi-user, real-time,
full-stack path — expensive to run, so it should stay a small number of
broad, realistic scenarios, not the place to enumerate every edge case.

Everything in this plan is the opposite shape: fast, isolated,
mocked-at-the-boundary, and exhaustive about edge cases specifically
*because* it's cheap to run. If a milestone below finds itself wanting
to spin up a real browser or assert a socket actually received a
message across two clients, that's a sign the test belongs in the e2e
file instead, not a gap in this plan.

## M0 — Tooling & config

Nothing here is a test yet — this is the scaffolding every later
milestone depends on.

- **Packages:** `vitest`, `@vitejs/plugin-react` (or the equivalent
  Next-aware plugin), `jsdom`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`.
- **Path aliases:** `tsconfig.json`'s `@/*` → `./*` has to resolve
  inside Vitest too, or every existing `@/...` import across
  `server/`, `lib/`, `components/`, `app/` breaks immediately.
  Whatever plugin handles this needs picking now, since it affects
  every later milestone equally.
- **Split environments, not one config.** This codebase has three
  genuinely different kinds of test:
  1. Pure Node, no DOM, no DB (`server/domain`, `server/validation`,
     `lib/*`, `server/auth/{jwt,password,tokens}.ts`).
  2. DOM via jsdom, no DB, no network — everything under
     `components/`.
  3. Node + a **real** Postgres connection (`server/application/*`,
     per §12's own table — deliberately not mocked repositories; see
     M3).

  Vitest's `projects` (formerly `workspace`) config is what maps
  cleanly onto this — one config, three projects, each with its own
  `environment` and `setupFiles` — rather than one global jsdom
  environment slowing down every pure-logic test, or one global node
  environment making every component test impossible.
- **RTL setup file** (the jsdom project only): `@testing-library/jest-dom`'s
  matchers registered once, `cleanup()` after each test (RTL does this
  automatically as of v10+, but confirm the installed version before
  assuming it).
- **The test-Postgres decision, needed before M3 can start:** a
  separate `DATABASE_URL_TEST` (or a schema/branch of the same local
  Postgres Playwright's `webServer` already assumes exists — this
  isn't a new infra category, just a second consumer of it), and a
  reset strategy between test files (re-run migrations once per run +
  truncate relevant tables per test, vs. a transaction-per-test that
  rolls back — the latter is faster if the Prisma setup here supports
  it cleanly, worth a quick spike before committing). Decide this
  explicitly rather than discovering it mid-M3.
- **Scripts:** `test`, `test:watch`, `coverage` (scoped per-project —
  see M9). Decide now whether the real-Postgres project is included
  in the default `test` run or requires an explicit flag/opt-in,
  since it needs infra the other two don't.

## M1 — Domain layer (pure, Node project)

The highest value-per-effort milestone: zero mocking, zero DOM, zero
DB, and it's where the actual business *rules* live, not just
CRUD.

- **`server/domain/service.ts` — `statusForTelemetry`.** The real
  content here: boundary tests at exactly each threshold (`latencyMs
  === degradedLatencyMs`, `=== outageLatencyMs`, same for
  `errorRate`), confirming outage is checked before degraded (a
  latency that clears the outage bar shouldn't fall through to
  "degraded" just because it also clears that lower bar), and the
  default-thresholds object sanity-checked against realistic
  inputs.
- **`server/domain/team.ts` — `roleChangeViolation` /
  `deactivationViolation`.** Every `TeamRuleViolation` case: acting on
  yourself (`self_role_change`/`self_deactivation`), demoting/
  deactivating the last active Manager (`last_manager`, at the exact
  boundary of `activeManagerCount <= 1`), and the ordinary allowed
  case (no violation). Also: every key in `TeamRuleViolation` has a
  corresponding entry in `teamRuleMessages` — cheap to check, cheap to
  let drift silently otherwise.
- **`server/domain/ticket.ts` / `incident.ts`.** These two are
  deliberately *not* rule-encoding (the file comments say so
  explicitly) — just exported status/priority/severity arrays. Light
  smoke coverage only: each array's contents match the corresponding
  union type in `types/index.ts` exactly. This is the kind of test
  that looks trivial until someone adds a status in one place and
  forgets the other.
- **`lib/permissions.ts`.** `canManageServices` / `canManageTeam` for
  both roles — four assertions, but it's the single source of truth
  every role-gated affordance in the whole app calls through, so it's
  worth its own file.
- **`lib/action-result.ts`.** `unwrap` (ok passthrough, err → thrown
  `ActionFailure`), `failureMessage`'s three branches: an
  `ActionFailure`'s own message wins, the offline branch (needs
  `navigator.onLine` stubbed — available in the Node project via a
  minimal global shim, or this one test file opts into jsdom;
  decide which once M0's project split is in place), and the generic
  created/updated wording fallback.
- **`lib/style.ts`.** `relativeTime`, `dayLabel`, `formatDuration`,
  `formatErrorRate`, `initialsOf` — all pure given an explicit `now`,
  which is exactly what makes them testable without touching
  `lib/use-now.ts`'s hook (that's M5). Boundary-heavy, same as
  `statusForTelemetry`: the `<5s "just now"`/`<60s`/`<60m`/`<24h`/`<7d`
  cutoffs in `relativeTime`, the `0`/`1`/`≥2` day cases in `dayLabel`,
  the minute/hour/day rollovers in `formatDuration`.
- **Worth flagging, not silently fixing:** `lib/initials.ts` exports
  `initialsFor`, and `lib/style.ts` separately exports `initialsOf`.
  Same apparent purpose, different implementations (`initialsFor`
  takes the first letter of up to the first two words; `initialsOf`
  takes first-word-first-letter + last-word-first-letter). Writing
  tests for both as they currently stand will make the exact
  behavioral difference concrete — worth surfacing back rather than
  quietly picking one to "fix" as a side effect of writing its test.

## M2 — Auth crypto (pure, Node project)

Deliberately separated from M1: security-sensitive, and worth its own
review pass rather than being one bullet among many.

- **`server/auth/password.ts`.** `hashPassword` → `verifyPassword`
  round-trips; a wrong password is rejected; a corrupt/short stored
  hash (the `salt:hash` split failing, or a length mismatch hitting
  the explicit guard in front of `timingSafeEqual`) returns `false`
  rather than throwing.
- **`server/auth/tokens.ts`.** `generateRefreshToken` produces
  distinct values across calls (not a strict "prove randomness" test,
  just "two calls don't collide in any small sample"); `hashRefreshToken`
  is deterministic (same input → same output) and actually changes
  output for a different input.
- **`server/auth/jwt.ts`.** Sign → verify round-trip returns the same
  claims; a tampered token (flip a character) fails verification; an
  expired token fails verification; a missing `JWT_SECRET` throws the
  documented error (needs `vi.stubEnv`/`vi.unstubAllEnvs` around this
  one test, or a per-test env sandbox — pick one convention here since
  every later env-dependent test will copy whatever pattern this one
  sets).
- **Deliberately excluded:** `server/auth/session.ts` and
  `server/auth/cookies.ts`. Both depend on Next's request-scoped
  `cookies()` and a real DB lookup (`session.ts`'s `getCurrentUser()`)
  — mocking both away to unit-test this leaves a test that mostly
  exercises the mocks. The login/session flow is already exercised
  end-to-end by `e2e/ticket-realtime.spec.ts`'s `loginAs()` helper on
  every run; leave it there rather than half-recreating it here. If
  `session.ts` grows real branching logic beyond "look up the token
  and the user" later, revisit.

## M3 — Application / use-case layer (Vitest + real test Postgres)

Per §12's table, deliberately *not* mocked repositories — the point of
this row is validation → authorization → persistence → activity
record as one real chain, including the version-conflict path, which
a mocked repository would just assert "was called with X" rather than
actually prove.

Needs M0's test-DB decision resolved first.

- **Scope:** `server/application/{tickets,incidents,services,
  activities,users,invitations,organizations,auth,realtime}.ts` — nine
  files, likely one test file per resource rather than trying to
  cover all nine as a single unit of work.
- **What actually matters here** (per the roadmap's own framing,
  echoed by what M1 already unit-tested at the pure-function level):
  - The chain itself: a bad input rejected by the Zod schema before
    it ever reaches a repository call; an authorization check (e.g.
    "does this ticket's org match the session's org") rejecting a
    cross-org access attempt; a successful write actually landing in
    Postgres, not just returning a mapped shape.
  - **The version-conflict path** — `ConflictError` thrown when
    `updateTicketConditional`'s expected version doesn't match what's
    actually in the row, specifically because two concurrent writes
    (or a stale client) produced this, not because of a coding
    mistake. This is called out by name in the roadmap's table and is
    exactly the kind of bug that's easy to introduce and hard to
    notice without a DB-backed test forcing the race.
  - `server/domain/team.ts`'s guard functions (M1 already
    unit-tested the pure logic) actually enforced end-to-end through
    `server/application/users.ts`'s real locked transaction
    (`withTeamLock`) — this is the layer where "read under a lock"
    either works or doesn't; M1 can't prove that on its own.
  - `recordActivity`'s side effect actually persists a row, not just
    "was called."
- **`broadcastToOrg` calls from this layer:** don't assert on these
  here — that's M4's job specifically so the "did we call broadcast
  with the right payload" question has one home instead of being
  half-checked in two places. Either let the real broadcast call fire
  and ignore it (if it fails loudly without a live Supabase project,
  mock just that one function at the boundary for this layer's tests
  and leave the shape-correctness assertion to M4), or stub it — worth
  a quick decision once this milestone starts, not a blocker before
  then.

## M4 — Realtime broadcast shape (thin integration test)

The lightest-weight row in §12's table, and deliberately kept that
way — a way to catch a broadcast-payload regression fast, without
needing the full two-browser-context Playwright test to notice it.

- **`server/realtime/broadcast.ts`.** Mock the Supabase client at the
  boundary (the channel/`.send()` call itself, not `broadcastToOrg`),
  and assert that each application-layer call site
  (`ticket.created`/`.updated`, `incident.*`, `service.*`,
  `activity.created`) invokes it with the event name and payload
  shape the realtime consumers (`RealtimeProvider.tsx`,
  `PresenceRail`) actually expect.
- This is a contract/shape test, not a "did the message actually
  arrive" test — that question stays with Playwright's real two-context
  scenario. If this milestone starts growing assertions about actual
  delivery, that's the signal it's drifted into e2e's job.

## M5 — Shared UI primitives (Vitest + RTL, jsdom project)

First jsdom milestone. Small, composable, no server actions to mock —
these become the vocabulary every later component test is written in.

- **Presentational/interactive:** `SelectField`, `TextField`, `Modal`,
  `ConfirmDialog`, `FilterPill`, `SearchInput`, `Toast`, `Sparkline`,
  `ActivityDescription`, `ConnectionBanner`, `TopBar`. Rendering by
  prop variant, accessible roles/labels, keyboard and click
  interaction (`user-event`, not raw `fireEvent`, per RTL's own
  guidance) — a `Modal` closing on Escape/backdrop click, a
  `SearchInput` firing its `onChange` per keystroke, a `FilterPill`'s
  active/inactive visual state matching its prop.
- **`Skeleton` / `SkeletonCircle` / `SkeletonText`
  (`components/shared/Skeleton.tsx`).** Trivial in isolation, but
  they're now load-bearing across six view skeletons
  (`DashboardSkeleton` plus the five built across the streaming SSR
  work) — worth pinning their prop→class-name behavior so a change
  here doesn't silently reshape six unrelated skeletons at once.
- **`lib/use-now.ts`.** A hook, not a pure function (unlike everything
  in M1) — belongs here specifically because it needs `renderHook`
  and `vi.useFakeTimers()`: returns `null` before mount, flips to a
  real `Date` after, advances on the `intervalMs` tick. This is what
  makes `relativeTime`/`dayLabel` (already unit-tested against an
  explicit `now` in M1) safe in actual rendered output.
- **`QueryProvider` / `RealtimeProvider`:** not unit-tested here
  beyond "provides the value/client it's given." Their real job from
  this point on is becoming the shared test-utils render wrapper for
  M6/M7 (a `renderWithProviders()` helper wrapping RTL's `render`) —
  noted explicitly so that's understood as their coverage, not a gap.

## M6 — Big client views (Vitest + RTL)

The highest-volume milestone — this is where most of the app's actual
client-side logic (filtering, search, sorting, mutation UX) lives, and
where the query-count corrections from STREAMING_SSR_TODO.md
(Tickets/Incidents/Services/Activity each running more queries than
first assumed) already proved that assuming a view's behavior from a
one-line description isn't reliable — the same caution applies here:
open each component and enumerate what it actually does before writing
its test list.

- **Scope:** `TicketsView`, `IncidentsView`, `ServicesView`,
  `ActivityView`, `TeamView`.
- **Mocking boundary:** `vi.mock()` each resource's `actions.ts`
  module (the same server actions the real `page.tsx` prefetches),
  not `fetch` and not TanStack Query itself. Wrap every render in a
  fresh `QueryClient` per test (`retry: false`, so a deliberately
  failing mock resolves immediately instead of retrying into a
  timeout).
- **Cover, per view:** loading/error/empty states; filter-pill counts
  and switching between them; search-box filtering (case-insensitivity,
  matching against every field the real component checks — e.g.
  Tickets/Incidents match title, Team matches name and email);
  optimistic-mutation rollback on a simulated conflict.
- **Specifically regression-pin `TeamView`'s self-first sort** (the
  `rank(u) === self.id ? 0 : 1` change made this session) — this was a
  manual request, not derived from any spec doc the way most of this
  app's behavior is, so nothing else in the codebase documents or
  guards it. Same treatment for `ServicesView`'s Manager-only
  affordances and `TeamView`'s page-level gate reflected in what
  renders for each role.
- **Skeleton-drift check, one per view:** a cheap smoke test asserting
  each `*ViewSkeleton` renders without throwing, alongside a rough
  structural check (row count, presence of the filter-bar/search
  elements) against what the real view's own loading/empty output
  looks like. This is exactly the risk STREAMING_SSR_TODO.md's own
  closing recap flagged — a skeleton silently drifting from its real
  view's layout with nothing to catch it — and it's cheap to write
  once each view's own tests already exist.

## M7 — Dashboard composite + panels (Vitest + RTL)

Same shape as M6, scoped to the dashboard's own panels, which have one
extra wrinkle none of M6's views do: real-time presence.

- **Scope:** `DashboardView` and its five panels — `StatRow`,
  `IncidentsPanel`, `ServiceHealthGrid`, `TicketBoard`, `ActivityFeed`,
  `PresenceRail`.
- **`DashboardView`'s own `isError` handling** — the fix already
  called "Done" in STREAMING_SSR_TODO.md's Dashboard entry (every
  query's `isError` feeding its panel(s) and the matching `StatRow`
  entries) is exactly the kind of branch this milestone should pin: a
  failed query renders its panel's "Couldn't load X. Try again." state,
  not a silent "0 active incidents, everything healthy."
- **`PresenceRail`'s ranking** (you first, then online, then
  everyone else) needs `RealtimeProvider`'s hooks
  (`useCurrentUserId`/`useOnlineUserIds`/`usePresenceReady`/
  `useRealtimeStatus`) mocked directly rather than routed through a
  real provider — this is the same kind of manually-specified ordering
  as `TeamView`'s self-first sort in M6, and both should get the same
  level of test rigor for consistency's sake, not one thoroughly
  tested and the other assumed-fine because it shipped first.
- Same skeleton-drift smoke check as M6, applied to `DashboardSkeleton`.

## M8 — Modals & forms (Vitest + RTL)

- **Scope:** `TicketModal`, `IncidentModal`, `ServiceModal`,
  `TeamInviteModal`.
- **Validation surfacing:** each modal's `useState`-based form runs
  the matching Zod schema from `server/validation/*.ts` through
  `.safeParse()` on submit (per that file's own doc comment — no
  React Hook Form + zodResolver by design). M1 already unit-tested the
  schemas themselves; this milestone's job is confirming each modal
  actually surfaces the resulting error to the person — the right
  field, the right message, not just "submit was blocked."
- Submit/cancel behavior, and the version-conflict "Load latest"
  banner UI (BACKEND_ROADMAP.md mentions this for `IncidentModal` and
  a ticket equivalent) — disables Save, replaces unsaved edits with
  the live row's version once acknowledged.

## M9 — Coverage + CI wiring

- **Coverage thresholds, scoped realistically per M0's project split:**
  a hard threshold makes sense for the Node project (domain/lib/
  validation/auth — pure functions have no excuse for gaps) and
  arguably the real-Postgres application project; a hard percentage
  on the jsdom/RTL project is a weaker signal than "did we assert the
  right things" and shouldn't be the bar that gates a merge.
- **Wire `npm test` (or the per-project equivalent) into whatever CI
  already runs `eslint`/`tsc`/Playwright.** Decide whether the
  real-Postgres project runs on every PR (needs CI to provision that
  DB, same as Playwright's `webServer` already needs one) or is
  opt-in/nightly if that's not always available — don't let "no test
  DB in this particular CI run" silently skip M3's tests without that
  being a visible, deliberate choice.
- Document, in `package.json` scripts and/or a short README section,
  which command runs which project — someone running `npm test` cold
  should immediately know whether that just ran the fast pure-logic
  suite or also touched a real database.

## Notes for whoever picks this up

- **Order isn't strict lockstep.** M1 and M2 need nothing from M0
  beyond the Node project existing — they can start immediately. M5
  through M8 need only the jsdom project, no DB, and can run in
  parallel with M3/M4 once both project configs exist. M3 and M4 are
  the only ones gated on the test-Postgres decision.
- **If starting narrow rather than milestone-by-milestone,** the two
  highest-value, least-covered-elsewhere behaviors right now are
  `TeamView`'s self-first sort (M6) and `PresenceRail`'s you-first/
  online/offline ranking (M7) — both manually specified this session,
  neither derived from a spec doc, and neither has any other net
  underneath it yet.
- **The e2e boundary from earlier in this file is worth restating
  once more:** if any test in M3 or M4 catches itself wanting a real
  browser or a second real client to assert delivery, that's the
  signal it belongs in `e2e/ticket-realtime.spec.ts` instead of here.
- Nothing in this plan has been run — no `vitest` installed yet, no
  config written. This file is the plan to review before any of that
  starts, not a record of work already done.
