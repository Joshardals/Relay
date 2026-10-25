# Relay — Backend Roadmap

Source: RELAY_README.md §0–§14 (Part II, Implementation Plan). The
milestone order below is the README's own (§14) — this doc expands each
one with what's already done, what's net-new, and the decisions that
have to be made at or before each step. Supersedes the looser Milestone-1
sketch from earlier in this project; this one is sourced directly from
the spec's actual sections rather than paraphrased from memory.

---

## Progress

| Milestone | Status |
|---|---|
| 1 — Foundations | Done |
| 2 — Tickets, non-realtime | Done |
| 3 — Realtime for tickets | Done |
| 4 — Services + telemetry worker | Done |
| 5 — Incidents + core relationships | Done |
| 6 — Activity stream | Done |
| 7 — Presence | Done |
| 8 — Reliability pass | Done for tickets, services, and incidents |
| 9 — Dashboard composition | Not started |
| 10 — Team management | Done |

---

## Decisions — resolved

1. **ORM: Prisma, not Drizzle.** README §9 names Drizzle explicitly, but
   the repo's existing Prisma schema is solid and already matches §1's
   data model — resolved to keep it rather than migrate. This costs
   nothing: the tenant-isolation strategy (§3, Layer 1 — every repository
   function takes `orgId` as its required first parameter) is completely
   ORM-agnostic. Only the module-structure note in §9 needs a wording fix
   (`/server/repositories — Prisma query functions`, `/db` →
   `/prisma/schema.prisma`, already present) — not a re-architecture.
2. **Realtime Authorization — verify, but proceed with confidence.**
   Checked this against Supabase's actual current docs rather than
   assume: Broadcast/Presence Authorization via RLS on
   `realtime.messages` is a core Realtime capability (a per-project
   toggle in Realtime Settings + RLS policies on that table), not gated
   behind a paid tier, and explicitly supports HS256 symmetric JWT
   verification with a shared signing secret — exactly what §4 calls
   for. Still do the concrete check the README asks for before Milestone
   3 (confirm the toggle and write one test RLS policy against
   `realtime.messages` on the actual project), but this is no longer
   treated as an open risk to the §0 architecture — it's expected to
   work.
3. **TanStack Query — adopt exactly as §10 specifies, no deviation.**
   Introduced at Milestone 2, not earlier (nothing to query against mock
   data). Query-key shape (`["tickets", orgId]`, etc.) gets decided at
   that point and kept consistent, since Milestone 3's
   `invalidateQueries()` calls depend on it.
4. **React Hook Form — deliberately not adopted (for now); Zod is.**
   The risk RHF+Zod is meant to prevent — server and client silently
   drifting into two different definitions of "a valid ticket" — is real,
   so the Zod schemas from §11 stay the single source of truth. But full
   React Hook Form on top of that is solving a problem the current forms
   (`TicketModal`, `IncidentModal`, `ServiceModal`, `TeamInviteModal` —
   4–6 plain fields each) don't have: RHF earns its keep on complex forms
   (dynamic arrays, heavy cross-field logic, uncontrolled-input perf at
   scale), not forms this size. Resolved: keep the existing `useState`-
   based forms, but run the same Zod schema through `.safeParse()` on
   submit and surface its errors — one shared source of truth for
   validity, without a rewrite that buys little at this complexity level.
   Revisit RHF if a form actually grows complex enough to justify it.

---

## Milestone 1 — Foundations

*README: "schema + migrations, JWT auth (login/refresh), org-scoping
helper, empty dashboard shell."*

**Status: done.** Everything under "Already done" and "Net-new" below
has been built (real JWT auth, org-scoped repositories, the `/server`
module skeleton). The lists below are kept as the record of what this
milestone covered.

**Already done:**
- Schema matches §1's data model closely — org-scoping FK on every
  table, `version` columns (§2 concurrency), the partial unique index
  enforcing one active incident-ticket link (§2), the `Activity` enum
  (§13), a `refresh_tokens` table shaped for §4's rotation flow. One
  migration applied.
- "Empty dashboard shell" — overshot this substantially; the full UI
  exists already (all pages, all interactions), currently against mock
  data and a fake cookie-based "session" (`lib/dev-self.ts`,
  `lib/dev-auth-actions.ts`).

**Net-new:**
- Audit the existing migration against §2's actual index list —
  `(org_id)` on every domain table, `(org_id, status)` on
  tickets/incidents/services, `(org_id, created_at DESC)` on activities,
  `(assignee_id)` / `(responder_id)`, and the `incident_tickets` /
  `incident_services` join indexes. Some of these likely aren't there
  yet.
- Real JWT auth per §4: HS256, short-lived (~15 min) httpOnly-cookie
  access token (`sub`, `org_id`, `role`, `exp`), opaque refresh token
  hashed in `refresh_tokens`, rotated on every use. A single
  `getSessionFromRequest()` helper — every Server Action and Route
  Handler goes through it, no component parses a JWT itself (AUTH-06).
  This replaces `lib/dev-self.ts` and the whole `/login` sign-in flow —
  same UI, real credentials underneath.
- The org-scoping helper (§3, Layer 1): every repository function takes
  `orgId` as a required first parameter, sourced only from the verified
  JWT. Code-review rule per the README: no repository function may omit
  it. RLS (§3, Layer 2) is explicitly deferred by the README — not a
  Milestone 1 blocker.
- The `/server`, `/db`, `/workers`, `/lib` module skeleton from §9 —
  none of it exists yet: `/server/application`, `/server/domain`,
  `/server/repositories`, `/server/auth`, `/server/realtime` (stub for
  now), `/server/validation`.

---

## Milestone 2 — Tickets, non-realtime

*README: "create/assign/status/priority CRUD over plain HTTP. Proves the
application/domain/repository layering before Realtime enters the
picture."*

**Status: done.** Ticket CRUD runs through real Server Actions, the
application/domain/repository layers, shared Zod validation, and
TanStack Query. The lists below are kept as the record of what this
milestone covered.

**Already done:** the entire ticket UI (list, filters, create/edit
modal, assign-to-me) — built against local optimistic state.

**Net-new:**
- Real Server Actions calling `/server/application` use-cases
  (`createTicket()`, `assignTicket()`, etc.) — never repositories
  directly (§9's boundary rule).
- Zod schemas per §11 (`createTicketInput`, etc.) as the single source
  of truth, server-side validation before anything reaches domain logic.
  Client side, per the resolved decision above: run the same schema
  through `.safeParse()` in the existing `useState`-based forms rather
  than adopting React Hook Form — one shared source of truth for
  validity, without a rewrite the current form complexity doesn't need.
- Swap `TicketsView`'s local `useState` for TanStack Query (§10: "TanStack
  Query owns all server-derived state... one `QueryClientProvider` at the
  root"). Nothing in the repo uses TanStack Query yet — this is a real
  addition, not a small one.
- Domain invariants (valid status transitions) live in `/server/domain`,
  separate from the Zod "is this shape valid" check (§11).

---

## Milestone 3 — Realtime for tickets

*README: "wire Broadcast + Realtime Authorization + TanStack invalidation
for the ticket slice only. First point §41 Tests 1 & 2 can pass."*

**Status: done.** Org-scoped Broadcast with Realtime Authorization,
the Realtime-scoped JWT, `RealtimeProvider` with TanStack invalidation,
and the Tests 1 & 2 Playwright spec are all in place. The notes below
are kept as the record of what this milestone covered.

- Do the concrete Realtime Settings check from the resolved decision
  above before starting this milestone specifically — README calls this
  out by name, and it's cheap to confirm even though it's no longer
  treated as a real open risk.
- Supabase Realtime Broadcast channel per org (`org:{orgId}`), authorized
  via Realtime Authorization RLS policies on `realtime.messages` keyed
  on a custom `org_id` claim (§0, §6) — not Postgres Changes / `auth.uid()`.
- A Realtime-scoped JWT, same secret/claims as the access token, minted
  alongside login/refresh; `supabase.realtime.setAuth()` client-side
  before subscribing (§4).
- A single `<RealtimeProvider>` near the root (§10) — subscribes once,
  holds no domain state itself, calls `queryClient.invalidateQueries()`
  per the event mapping in §7.
- Write the Playwright two-browser-context test now (§12) and keep it
  red until this milestone's slice of it (Tests 1 & 2 — create a ticket
  in Browser A, Browser B sees it and the assignment without a reload)
  passes. README is explicit this test *is* the definition of done, not
  a final-phase checkbox.

---

## Milestone 4 — Services + telemetry worker

*README: "service CRUD/view, worker writing simulated telemetry, SM-01–
SM-06, realtime service updates (Test 6)."*

**Status: done.** Service CRUD runs through the same layered path as
tickets (Manager-gated), `/workers/telemetry.ts` is a standalone process
writing through `updateServiceTelemetry()`, service-status changes write
an `Activity` row ahead of Milestone 6, `service.updated` broadcasts with
the client-side debounce §7 calls for, and the Test 6 slice of the
Playwright spec is in place. The lists below are kept as the record of
what this milestone covered.

**Already done:** the service catalog UI, including the archive/restore
model (not hard-delete, per §19) built a few turns ago.

**Net-new:**
- Real service CRUD through the same layered path as tickets — plus a
  role check tickets never needed: `createService`/`updateService` are
  Manager-only (`lib/permissions.ts#canManageServices`), enforced
  server-side for the first time in this codebase via a new
  `ForbiddenError` in `server/application/errors.ts`. `archived` was
  added to the `Service` table (the TS type already had it, the column
  didn't) via a new migration; archive/restore travels through the same
  version-checked `updateService` as a name/description edit.
- `server/repositories/activities.ts` and a `createActivity()` write
  path, pulled forward from Milestone 6 specifically because SM-05
  needs it now — `updateServiceTelemetry()` writes an Activity row
  (`actorId: null`, satisfying SM-06) only when status actually
  changes, not on every latency jiggle.
- `server/repositories/organizations.ts` / a small
  `server/application/organizations.ts` wrapper — the one other function
  besides login allowed to skip the "every repository call takes orgId
  first" rule, since the worker needs to enumerate orgs before it has one.
- `/workers/telemetry.ts` (§13) — a standalone, long-lived Node process
  (not serverless/cron, not over HTTP), importing only from
  `/server/application` (plus the pure, DB-free `server/domain/service.ts`
  threshold function), never repositories directly. On each tick,
  calls the same `updateServiceTelemetry()` use-case a human-triggered
  path would call — so the version bump, the activity record on status
  change, and the Realtime broadcast all happen identically to any other
  mutation, with zero new auth surface. Never touches Incidents (§9: "a
  human decides"). Simulates a random walk with a recovery pull toward a
  healthy baseline plus occasional spikes, rather than fully independent
  ticks, so degradation is both plausible and not permanent. Run via
  `npm run worker:telemetry`; relies on tsx resolving `@/*` tsconfig
  paths the way the rest of `/server` does — flagged in the file's own
  comment as worth confirming with a real run, same spirit as the
  Realtime Settings check called out before Milestone 3.
- `RealtimeProvider.tsx` gained a `service.updated` handler with the
  §7-mandated trailing-edge debounce (~1.5s per service id), so a busy
  telemetry tick doesn't trigger a refetch storm.
- `prisma/seed.ts` now seeds three services (fixed ids, idempotent
  upsert, `update: {}` so re-seeding never clobbers what the worker or a
  Manager has since written) — there was nothing for `/services` or the
  worker to act on before this.
- Realtime propagation → §41 Test 6 (simulate degradation, both
  dashboards update), added to `e2e/ticket-realtime.spec.ts` alongside
  Tests 1/2/8. There's no UI affordance to simulate degradation by
  design (status is telemetry-only), so the test calls
  `updateServiceTelemetry()` directly from its own Node process — the
  same function and write path the real worker's tick would use, just
  invoked deterministically instead of waiting on a random ~4s tick.
  Like the rest of the suite, correct-by-construction, not
  verified-by-execution (no DB/network in this session — see
  `playwright.config.ts`'s comment).

---

## Milestone 5 — Incidents + the core relationships

*README: "incident CRUD, incident↔service, incident↔ticket linking (with
the partial-unique-index enforcement), realtime propagation (Tests 3–5,
7)."*

**Status: done.** Incident CRUD runs through the same layered path as
tickets/services, both link tables (`incident_services` plain many-to-
many, `incident_tickets` with the partial unique index) sync through a
version-checked transaction, the index's conflict has its own error code
wired to the UI, `incident.updated` broadcasts, and Tests 3/4/5/7 are in
`e2e/ticket-realtime.spec.ts`. Per Milestone 8's "still to do" note,
incidents also got the full reliability treatment (optimistic
update/rollback, version-conflict UX) as part of this milestone rather
than deferred further — see Milestone 8 below, which this closes out.
The lists below are kept as the record of what this milestone covered.

**Already done:** the incident UI, including the service/ticket linking
checklists in `IncidentModal` — built to match this relationship model
already, just against local state.

**Net-new:**
- Real incident CRUD through the same layered path as tickets/services:
  `server/domain/incident.ts` (status/severity constants, same
  permissive-lifecycle reasoning as `ticket.ts` — §6.1's diagram is
  descriptive, not a strict state machine), `server/validation/
  incidents.ts` (Zod, `.safeParse()` on submit per the resolved
  React-Hook-Form decision), `server/repositories/incidents.ts`,
  `server/application/incidents.ts`, `app/(dashboard)/incidents/
  actions.ts`. No role gate (`lib/permissions.ts` already resolved
  incidents as identical for Member/Manager). No `Activity` row writes
  yet — that stays Milestone 6's job, same as tickets; only services got
  that pulled forward, for SM-05 specifically.
- Incident↔service linking (§8.2's plain many-to-many): a diff-and-sync
  helper compares current membership against the checklist's full
  desired membership and issues `deleteMany`/`createMany`.
- Incident↔ticket linking (§8.1, the one with `one_active_incident_per_
  ticket`): diff-and-sync too, but `upsert` per ticket instead of
  `createMany` — the `(incidentId, ticketId)` pair can already exist as
  an inactive row (linked before, unlinked, now relinked), which needs
  an UPDATE, not an INSERT. The partial unique index's conflict (a
  ticket already actively linked to a *different* incident) now has a
  real path to the UI: a Postgres `P2002` on that index is recognized in
  the repository (`isTicketAlreadyLinkedConflict`), turned into a new
  `TicketAlreadyLinkedError` / `"ticket_conflict"` action-error code
  (distinct from the plain version-conflict `"conflict"` code, per this
  milestone's own earlier note that it needed its own code and message),
  and surfaced as its own toast message in `IncidentsView`.
- Create and update are both wrapped in a single Prisma transaction
  covering the scalar fields *and* both link syncs — a stale
  `expectedVersion` never touches links, and a ticket-link conflict
  rolls back any service/ticket changes already applied in the same
  edit, so an incident is never left half-updated.
- `resolvedAt` (IN-07) is computed server-side from the status
  transition: set the instant status first becomes `RESOLVED`, kept if
  it already was, cleared on reopen — centralized in `server/
  application/incidents.ts` so create and update derive it identically.
- `IncidentsView`/`IncidentModal` rewired from local/mock state to real
  queries and mutations, including the Milestone 8 reliability pattern
  (see above). `ServicesView` and `services/page.tsx` — whose "affecting
  incidents" list was explicitly waiting on this milestone's real
  query — now fetch incidents via `listIncidentsAction` instead of the
  mock-data prop they were threading through.
- Realtime propagation → §41 Tests 3, 4, 5, 7 (incident creation, impact
  via linked tickets, response assignment, recovery/resolution), added
  to `e2e/ticket-realtime.spec.ts` alongside Tests 1/2/6/8.
  `RealtimeProvider.tsx` gained an `incident.updated` handler — invalidates
  immediately, no debounce (§9: incidents are human-driven, not a
  multi-second telemetry tick like `service.updated`).

---

## Milestone 6 — Activity stream

*README: "activity generation wired into every use-case above (retrofit
is fine...), paginated view, realtime `activity.created`."*

**Status: done.** Every mutation from Milestones 2–5 that has a matching
`ActivityAction` now writes a row through one shared write path
(`recordActivity`, which writes and broadcasts together so the two can
never drift apart), the activity page is a real cursor-paginated
`useInfiniteQuery` view instead of a client-side slice over mock data,
and `activity.created` propagates live. One real gap found along the
way is flagged below rather than worked around.

**Already done:** the read-side UI (`ActivityView`, `ActivityFeed`,
`ActivityDescription`'s per-action rendering) and the write path itself,
both pulled forward — `ActivityView`'s "Load more" already modeled the
paginated contract against mock data, and `services.ts`'s
`updateServiceTelemetry` (Milestone 4) already wrote real
`SERVICE_STATUS_CHANGED` rows for SM-05.

**Net-new:**
- `recordActivity` (`server/application/activities.ts`): the single
  write-and-broadcast path every use-case below calls. One row = one
  `activity.created` broadcast, never batched — even a request that
  changes several things at once (e.g. an incident update that changes
  status *and* links a ticket) writes and broadcasts each fact
  separately, matching the "one event per row" grain Milestone 5 used
  for `incident.updated`.
- Tickets (`server/application/tickets.ts`) now write `TICKET_CREATED`
  on create, and diff `updateTicket`'s input against the ticket's prior
  state to write `TICKET_ASSIGNED`/`TICKET_STATUS_CHANGED`/
  `TICKET_PRIORITY_CHANGED` only for fields that actually changed value
  — not merely present in the request, since TicketModal resubmits
  every field on every save (this is the exact diff this file's own
  Milestone 2 doc comment flagged as deferred to here).
  `TICKET_ASSIGNED`'s metadata needs the assignee's *display name*
  (`ActivityDescription.tsx` renders it directly, not resolved from an
  id) — the one name lookup in this retrofit, reusing
  `assertAssigneeInOrg`'s existing query rather than a second one.
- Incidents (`server/application/incidents.ts`) write `INCIDENT_CREATED`
  on create; `updateIncident` diffs the same way for
  `INCIDENT_STATUS_CHANGED`/`INCIDENT_SEVERITY_CHANGED`, one row per
  added/removed id for `INCIDENT_SERVICE_LINKED`/`_UNLINKED` and
  `INCIDENT_TICKET_LINKED`/`_UNLINKED` (ticket-linked needs a title
  lookup, same reasoning as ticket-assigned above; service links don't,
  since `ActivityDescription` doesn't name the service). A status change
  *to* `RESOLVED` writes `INCIDENT_RESOLVED` instead of
  `INCIDENT_STATUS_CHANGED` — the schema models resolution as its own
  headline-style action, not a `{from,to}` transition, and IN-09 calls
  out "resolving" as distinct from "updating" for the same reason.
- `updateServiceTelemetry` (Milestone 4) now also broadcasts
  `activity.created` through the same `recordActivity` path — it
  predates that event existing, so it previously only wrote the row.
- Real paginated read side: `findActivityPage`
  (`server/repositories/activities.ts`, cursor on `id`, ordered
  `createdAt desc, id desc` to match the org/createdAt index and break
  ties deterministically), `listActivity`
  (`server/application/activities.ts`), `listActivityAction`
  (`app/(dashboard)/activity/actions.ts`). `ActivityView` now calls this
  through `useInfiniteQuery` instead of taking a full `activities` array
  as a prop — search/filter still run client-side, but only over pages
  already fetched (a real limitation of layering client search on real
  pagination, not a bug: a query that would only match further back than
  "Load more" has reached won't surface until the user loads more).
- `activity/page.tsx` no longer imports mock data or takes a `self`
  prop it never needed — `ActivityView` self-fetches, same shape
  `IncidentsView`/`ServicesView` settled on in Milestone 5.
- `RealtimeProvider.tsx` gained an `activity.created` handler —
  immediate invalidation of `["activity","list"]`, no debounce (AC-04:
  activity is written by human-driven mutations, not a fast tick).

**Known gap, not worked around:** the schema's `ActivityAction` enum has
no action for an incident's *responder* changing (only
`INCIDENT_CREATED`/`STATUS_CHANGED`/`SEVERITY_CHANGED`/
`SERVICE_(UN)LINKED`/`TICKET_(UN)LINKED`/`RESOLVED` —
`prisma/schema.prisma`), unlike tickets, which do have
`TICKET_ASSIGNED`. IN-09 says "assigning... incidents must generate
activity events," so this is a real asymmetry in the committed schema,
not a deliberate scope cut. Fixing it needs a migration (a new
`INCIDENT_RESPONDER_ASSIGNED` value) plus an `ActivityDescription.tsx`
case, both a small, contained addition whenever you want it — happy to
do it now if you'd like, but didn't fold it into this retrofit pass
silently by overloading an existing action that doesn't really fit.

---

## Milestone 7 — Presence

*README: "online/offline via Realtime Presence, dashboard 'who's online'
panel."*

**Status: done.** Real Supabase Presence on the same `org:{orgId}`
channel RealtimeProvider already owned (§6: "no separate channel or
table"), exposed app-wide via a new `useOnlineUserIds()` hook, and
PresenceRail is now the real "who's online" panel rather than a static
mock set.

**Net-new:**
- `RealtimeProvider.tsx` now takes a `userId` prop and configures the
  channel with `presence: { key: userId }` — Presence's own key for this
  connection set to the signed-in user's id (not the random default), so
  two tabs/devices for the same person collapse into one entry and that
  entry is directly comparable to a real user id, no translation layer
  needed. `channel.track({...})` fires on every `SUBSCRIBED` (initial
  connect and every reconnect alike, since `connect()` already
  tears down and rebuilds the channel each time — no separate "re-track
  after reconnect" path to maintain), `channel.untrack()` on teardown
  (best-effort; `removeChannel()` right after is what actually
  guarantees the server stops considering the client present, same
  "eventually" PR-02 allows for). A `.on('presence', {event:'sync'})`
  handler rebuilds a `Set<string>` from `channel.presenceState()` on
  every join/leave (ours or anyone else's) and exposes it through a new
  `PresenceContext`/`useOnlineUserIds()` — PR-03's "ephemeral, not
  ordinary persisted state" is satisfied by construction: it only ever
  lives in this in-memory Set, never a table.
- `PresenceRail` (`components/dashboard/PresenceRail.tsx`) rewritten
  from a static, prop-driven presentational component into a
  self-contained one: real org users via `listOrgUsersAction` (the same
  query TicketModal/IncidentModal already use) cross-referenced against
  `useOnlineUserIds()`. Both had to go real together, not just the
  online-ids side — a real Presence key is a real user UUID, and it
  would never match a mock roster's `"u_maya"`-style ids, so every entry
  would render offline regardless of actual presence if only one half
  were swapped.
- `app/(dashboard)/layout.tsx` passes `userId={self.id}` to
  `RealtimeProvider` (a small, real, Milestone 1 session value — nothing
  new to fetch).
- `dashboard/page.tsx`: the minimal edit needed to make this
  observable at all, since PresenceRail is this milestone's only real
  consumer and no other page renders it. `<PresenceRail users={...}
  onlineIds={...} />` → `<PresenceRail />` (no props now); the mock
  `onlineUserIds`/`users` imports it no longer needs are dropped; the
  top `StatRow`'s "Online now" figure is removed rather than left on
  stale mock data that would silently contradict the real rail directly
  below it — that page's other four stats and the rest of its
  composition are still Milestone 9's job, untouched here.

**Known limitation, not a bug:** the top-level "Online now" stat card is
gone until Milestone 9, for the reason above. Restoring it for real is
small (a client component reading `useOnlineUserIds()`, or just
surfacing the count `PresenceRail` already shows) but doesn't fit a
server component still computing every other stat from mock data.

**Not yet done:** no e2e coverage. §41's numbered test list (Tests 1–8)
doesn't include one for Presence — PR-01/02/03 aren't part of that
suite — so this wasn't added automatically, same call made for
`activity.created` in Milestone 6. Worth adding if you want confidence
here: two browser contexts, confirm B's avatar flips to online in A
without a reload, then confirm closing B's context eventually flips it
back in A (PR-02's "eventually" suggests allowing for Presence's own
server-side timeout rather than an immediate assertion).

---

## Milestone 8 — Reliability pass

*README: "connection-lost UI state, reconnect-and-refetch-all (§35),
optimistic-update rollback, version-conflict UX. Exercises §41 Test 8
deliberately."*

**Status: done for tickets, services, and incidents.** The
connection-level pieces are app-wide and finished; the mutation-level
pieces (optimistic rollback, conflict UX, error toasts) are wired into
ticket, service, and — as of Milestone 5 — incident flows.

**Done (app-wide, no further work needed):**
- Real connection signal: `RealtimeProvider` exposes a four-state status
  (`connecting` / `connected` / `reconnecting` / `offline`), driven by
  the channel subscription and the browser's online/offline events.
  `LiveIndicator` renders it; the hardcoded `connected` prop is gone.
- `ConnectionBanner` in the dashboard layout: says data may be out of
  date while offline, or after ~2s of reconnecting (§18 "don't present
  stale state as current").
- Reconnect-and-refetch-all (§35): on `SUBSCRIBED`, every active query
  is invalidated. Offline stops the retry loop; `online` reconnects
  immediately with a fresh token.
- Tab-switch flicker fixed: coming back to a tab hidden for under 60s
  with the channel still joined no longer tears down and reconnects.
- Mutations use TanStack `networkMode: "always"`, so a save while
  offline fails fast (rollback + toast) instead of hanging on "Saving…".
- §41 Test 8 added to `e2e/ticket-realtime.spec.ts` (offline state
  visible, reconnect, ticket created during the outage reconciles).
  Written, not yet run against a real environment.

**Done, tickets and services:**
- Optimistic updates with rollback for ticket edits and "Assign to me"
  (`TicketsView`), and for service edits/archive/restore
  (`ServicesView`, M4): patch the list cache immediately, restore the
  snapshot on failure, always invalidate on settle so the server wins.
  Creates are deliberately not optimistic (server assigns the id) for
  both domains.
- Version-conflict UX in `TicketModal` and `ServiceModal`: watches the
  live row's version, shows a "Load latest" banner and disables Save if
  someone else (or, for services, the telemetry worker) changed it
  mid-edit; saves always go out against the version the form was loaded
  from.
- The toast system's `variant: "error"` has real callers across both
  domains: conflict, validation/not-found/forbidden, and network
  failures on mutations. `lib/action-result.ts` (`unwrap` /
  `ActionFailure` / `failureMessage`) is the shared bridge from Server
  Action results to TanStack `onError` — `failureMessage()` gained a
  `resource` parameter in M4 so its messages read "service" rather than
  always "ticket."
- `RealtimeProvider`'s event handling now covers `service.updated` too
  (M4), with the §7-mandated per-service debounce on top of the
  app-wide connection/banner/reconnect logic, which already covered it
  by invalidating everything on reconnect regardless.

**Done, incidents (M5):**
- Optimistic updates with rollback for incident edits and "Respond"
  (`IncidentsView`): same patch-list-cache/restore-snapshot/always-
  invalidate-on-settle pattern as tickets/services. Creates aren't
  optimistic here either.
- Version-conflict UX in `IncidentModal`, same "Load latest" banner /
  disabled-Save-while-stale pattern as `TicketModal`/`ServiceModal`.
- A second, distinct error path beyond the plain version conflict: the
  partial-unique-index conflict on incident↔ticket linking gets its own
  `"ticket_conflict"` code and its own toast message, rather than being
  folded into the generic `"conflict"` handling.
- `RealtimeProvider`'s event handling now covers `incident.updated` too,
  invalidating immediately (no debounce — incidents are human-driven,
  §9, not a telemetry tick).

**Still to do:**
- Run Test 8 (and Tests 1–7) against a real Postgres + Supabase project
  and confirm they pass — everything in this pass remains
  correct-by-construction, not verified-by-execution, per this session's
  environment limits.
- Optional: a "keep my changes and overwrite" choice in the conflict
  banner (currently "Load latest" replaces unsaved edits).

---

## Milestone 9 — Dashboard composition

*README: "assemble the unified view (§15) from query hooks built in
prior slices; last because it's pure composition, no independent logic."*

- Already fully built visually — every panel §15 asks for exists. This
  milestone is exactly the `TODO(milestone 9)` comment already sitting
  at the top of every page in the repo: swap the mock-data import for
  the real query hooks each prior milestone built.

---

## Milestone 10 — Team management

*README §14 doesn't have a milestone for this — the ordered list only
runs 1–9, and #9 is scoped as pure composition ("assemble the unified
view from query hooks built in prior slices... no independent logic").
Team management needs real, new logic (role-gated create/update/delete
of `User` rows), so it doesn't fit inside #9 even though one code
comment in the repo currently assumes it does (see below). This
milestone exists because §3.2 lists "Manage team members" as a Manager
capability and AUTH-04 requires manager-only operations to be protected
server-side — that requirement is real and currently unmet, not because
README's own plan called it out as a numbered slice.*

**Status: not started.** The UI is fully built and the read side is
already real; every write path is still local-only state.

**Already done:**
- The full Team page UI — `TeamView` (search, role dropdown per row,
  remove with `ConfirmDialog`) and `TeamInviteModal` (name/email/role
  form) — built against local `useState`, exactly the same "UI first,
  wire it up later" pattern every other domain went through.
- The Manager-only boundary, both halves of it: `canManageTeam()`
  (`lib/permissions.ts`) gates the `/team` route itself (`redirect` in
  `app/(dashboard)/team/page.tsx` if the signed-in user isn't a
  Manager) *and* hides the nav link for a Member (`components/shared/
  TopBar.tsx`). The redirect is the actual enforcement; the hidden nav
  link is the UX nicety on top of it — same split the page's own
  comment documents.
- The read side is already real, not mock: `listUsersForOrg`
  (`server/repositories/users.ts`) → `listOrgUsers`
  (`server/application/users.ts`) is a genuine org-scoped query,
  pulled forward in Milestone 2 for the ticket assignee picker and
  reused as-is by `IncidentModal` and (Milestone 7) `PresenceRail`.
  What's missing is everything *downstream* of that: `team/page.tsx`
  still imports the `users` array from `lib/mock-data` rather than
  calling `listOrgUsers`, and there's no `app/(dashboard)/team/
  actions.ts` at all — every other domain (tickets, services,
  incidents, activity) has one; team doesn't.

**Decisions — resolved.** Unlike the rest of this milestone, README is
silent on all four of the questions below, so these were made
explicitly for this roadmap rather than inferred from spec:

1. **Invite = a real invitation, not a pre-created account.** A Manager
   entering name/email/role creates a *pending invitation*, not an
   active `User` row. The invited person sets their own password when
   they accept; a Manager never generates or transmits a credential.
   Email delivery can be stubbed for MVP (no email transport exists in
   this repo — confirmed, nothing under `server/` sends mail anywhere
   today) but the underlying model is invite-and-accept either way, so
   the stub doesn't leak into the data model later.
2. **Remove = deactivate, never a hard delete.** Adds a `User.active`
   boolean (default `true`). Deactivating sets it `false`, revokes the
   user's refresh tokens, and blocks further login — but the row and
   every historical relationship (`Ticket.assignee`, `Ticket.creator`,
   `Incident.responder`, `Activity.actor`) stays intact. This is also
   the only option that doesn't fight the schema: those four relations
   are all `onDelete: Restrict` (`prisma/schema.prisma`), so a literal
   `DELETE FROM users` fails at the database the moment that user has
   ever created or been assigned a ticket, responded to an incident, or
   generated any activity — i.e. almost immediately for any real user.
   Same treatment README §19 already gave Services (archive, not
   hard-delete) — the "Remove member" button in the UI can keep its
   label; `deactivateUser` is what it calls.
3. **Team events go in the activity feed.** Four new `ActivityAction`
   values: `MEMBER_INVITED`, `MEMBER_JOINED`, `MEMBER_ROLE_CHANGED`,
   `MEMBER_DEACTIVATED`. (§13's Activity Requirements only enumerate
   ticket/service/incident events, so this is a deliberate extension
   of that list, not something §13 already implied.)
4. **An org can never drop to zero active Managers.** Enforced
   server-side, not just disabled in the UI — the same principle
   AUTH-07 already states for the self-protection rules below. Demoting
   or deactivating the last remaining Manager is a rejected operation,
   not a warning a Manager can click through.

**Net-new:**
- **Schema** (`prisma/schema.prisma`, needs a migration):
  - `User.active Boolean @default(true)`.
  - A new `Invitation` model — email, intended `role`, a hashed token,
    `expiresAt`, `acceptedAt` (nullable), `invitedById`. Kept as its
    own table rather than a status column on `User` so a pending
    invite never has to satisfy `User`'s `passwordHash String`
    (non-nullable today) or collide with the `@@unique([orgId, email])`
    constraint before anyone's actually joined.
  - `Activity.targetType`'s literal union (`types/`) gains `"user"`
    alongside the existing `"ticket" | "service" | "incident"` — the
    column itself is a plain string in the DB, so this is a
    types-and-application-layer change, not a migration.
- **Token handling** — reuse `server/auth/tokens.ts`'s existing
  `generateRefreshToken`/`hashRefreshToken` pair (opaque random value,
  SHA-256 hash at rest, same reasoning already written there: it's the
  DB row's `expiresAt` that's the source of truth, the token itself is
  just a lookup key) for the invite token instead of inventing a
  second scheme.
- `server/repositories/invitations.ts` — new file: `createInvitation`,
  `findInvitationByTokenHash`, `markInvitationAccepted`,
  `listPendingInvitationsForOrg` (the Team page will need to show
  pending invites alongside active members — `TeamView` currently has
  no concept of a "pending" row at all).
- `server/repositories/users.ts` — add `createUser` (called at accept-
  time, not invite-time), `updateUserRole`, `deactivateUser`, and a
  `countActiveManagers(orgId)` helper for the last-Manager guard. Also
  needs `active` added to the `WHERE` clause of
  `findUserByEmailForLogin`, `findUserById`, and `findUserByIdForSession`
  (`server/repositories/users.ts` / used from `server/application/
  auth.ts` and `server/auth/session.ts`) — otherwise a deactivated
  user with a still-unexpired access token keeps resolving to a valid
  session.
- `server/validation/users.ts` and `server/validation/invitations.ts` —
  neither exists yet. Zod schemas for invite input, role-change input,
  and accept-invitation input, same `.safeParse()`-on-submit pattern as
  every other domain.
- Write-side use-cases, Manager-gated via the existing `canManageTeam()`
  exactly the way `createService`/`updateService` check
  `canManageServices()`: `inviteMember`, `updateMemberRole`,
  `deactivateMember` in `server/application/users.ts` (or a new
  `server/application/invitations.ts` for the invite/accept half — the
  existing `auth.ts` is deliberately free of anything but login/
  refresh/logout, so accept-invitation, which also needs to *issue* a
  session, likely belongs next to that logic rather than inside it).
  Two rules the current client-only version already enforces in the
  *UI* (`TeamView`'s `isSelf` checks — a user can't change their own
  role or remove themselves) need to move server-side too, per AUTH-07
  — the UI disabling those controls isn't itself the enforcement — and
  the last-Manager guard (decision 4) needs the same server-side
  treatment, in both `updateMemberRole` and `deactivateMember`.
- `deactivateMember` calls the existing
  `revokeAllRefreshTokensForUser` (`server/repositories/refresh-
  tokens.ts`) — already written and explicitly commented as "not wired
  to any UI yet," waiting for exactly this. One residual gap worth
  knowing about rather than being surprised by later: access tokens
  are short-lived JWTs (`ACCESS_TOKEN_TTL_SECONDS = 15 * 60`,
  `server/auth/jwt.ts`) verified by signature alone in
  `requireSession()` — no DB round trip — so a just-deactivated user's
  already-issued access token can still pass `requireSession()` checks
  for up to 15 minutes after revocation, even though their refresh
  token is dead and they can't get a new one. `getCurrentUser()` (which
  does re-fetch the `User` row) would catch it immediately, but not
  every write action calls that path today.
- A new route for accepting an invitation — `app/invite/[token]/
  page.tsx` plus its Server Action — doesn't exist in any form yet;
  there's no equivalent of `app/login/` for it to be adapted from.
- `app/(dashboard)/team/actions.ts` — new file, same thin
  try/catch-and-`toActionError` shape as `services/actions.ts`.
- Rewire `team/page.tsx` off `lib/mock-data`'s `users` onto
  `listOrgUsers` (plus the new pending-invitations list), and convert
  `TeamView`/`TeamInviteModal` from local `useState` to TanStack Query
  + the new Server Actions — the same conversion every other `*View`
  went through in Milestones 2/4/5.

**Not covered by §41:** same situation as Presence in Milestone 7 —
the numbered Playwright acceptance tests (1–8) don't include team
management, so no e2e coverage is mandated by the spec here either.

---

## Testing, running throughout (not a final phase)

Per §12 — not sequenced as its own milestone, meant to run alongside
every one above:

| Layer | Tool | Covers |
|---|---|---|
| Domain | Vitest | Status-transition rules, invariants — pure functions |
| Application/use-case | Vitest + real test Postgres | Validation → authorization → persistence → activity record, incl. version-conflict path |
| Realtime | Manual + thin integration test | A committed mutation emits the expected broadcast event shape |
| End-to-end | Playwright, two browser contexts | §41's actual acceptance test — write it at Milestone 3, keep it red until Milestone 8 closes it out |
