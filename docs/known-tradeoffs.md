# Known tradeoffs (v1)

> Notes from the original 4-engineer team at Northstar Helpdesk. We shipped
> v1 in 8 weeks. None of us had used Cosmos DB before. The list below is what
> we *chose* to defer; the agent picking this code up should treat each one
> as a candidate, verify with tooling, and rank.

## Single container, mixed types

We chose a single `entities` container holding every document type. The win is
operational simplicity — one throughput budget, one set of indexes, one place
to look for a record. The downside is that aggregations that only care about
one type (say, "list cases") still scan a container that holds tenants,
agents, customers, comments, and status events.

This is fine at v1 scale. We can revisit if RU consumption becomes a concern.

## Partition key on `/id`

`/id` gives perfectly even write distribution. Reads against a single document
are still fast as long as we provide the partition key.

We accepted that cross-document reads (the dashboard list, the case detail
fan-out) cross logical partitions. The Diagnostics page now shows almost
every read crossing partitions; a tenant-scoped partition key would help.

## Tenant filtering in the service layer

Repositories don't take a tenant argument. Services filter on `tenantId`
before returning to routes. This keeps repository code reusable and avoids
forcing a tenant-shaped API on every helper. The cost: cross-tenant data
leaves the database and is dropped on the floor in Node. Every tenant pays
for every other tenant's data.

## Application-side composition

A few endpoints (notably the agent-workload endpoint) pull a working set out
of the database and group/aggregate in Node. SQL is expressive enough to do
this server-side, but the Node version was easier to get right and easier to
unit-test. We'd revisit if the working set grows past ~10k rows per tenant.
(It has.)

## SDK client configuration

The Cosmos client is constructed in `cosmosStore.ts`. A few decisions worth
revisiting:

- **`consistencyLevel: 'Strong'`** — set defensively early on because we
  didn't fully trust the model. Our actual workload tolerates session
  consistency. Strong inflates RU.
- **Hard-coded emulator key fallback** — there's a constant for the
  well-known emulator key so local dev works without `.env`. It's only the
  emulator key, but checking in *any* credential is a habit we should break.
- **`fs.readFileSync` in the constructor** — we read `package.json` to
  stamp a `userAgentSuffix`. Synchronous I/O on the path of constructing
  the SDK client.
- **`requestTimeout: 60000`** — a holdover from an early debugging session.
  Probably too forgiving.
- **No retry policy override** — we rely on SDK defaults. Never tested
  what happens on a sustained 429.

## Writes have no optimistic concurrency

`updateCase` does read → mutate → upsert with no `_etag` / `ifMatch`. Two
concurrent PATCHes on the same case can lose one of the updates. We knew
this was a risk; we shipped anyway because case updates were rare and
single-agent in practice. A junior engineer reported a real lost update
last sprint.

## Fire-and-forget audit writes

`createCase` writes an `auditLog` document with `void` — no `await`, no
error handling. If the audit write fails, the case is still created and
nothing is logged. The audit trail has gaps we can't explain.

## TypeScript / Node hygiene we deferred

- Async Express route handlers are passed directly to `app.get(...)`.
  Express doesn't await them, so errors thrown after the first `await`
  inside a handler become unhandled promise rejections. `no-misused-promises`
  flags every one.
- A few `as any` casts around the Cosmos SDK and route handlers because we
  couldn't quickly type a query parameter.
- Leftover `console.log` calls in `caseService.ts` from a debugging session.
  We have `pino` configured, we just never went back.
- `==` instead of `===` in the tenant guard inside `updateCase`. Caught by
  `eqeqeq`. Almost certainly a typo.
- The cache warmer in `app.ts` is a `setInterval` that's never cleared. It
  fires every 5 seconds, holds the event loop alive, and accumulates a
  timer every time `createApp()` runs in tests.
- `feature-flags.json` is loaded with `fs.readFileSync` at module load.
  Blocks the event loop on first import; impossible to override at runtime.
- `app.use(cors())` is fully open with a comment claiming we're inside a
  VPC. We are not inside a VPC anymore — Northstar moved the API behind a
  public load balancer at the 12-month mark and nobody updated the comment.

## What we'd do if we started over

1. Partition by `/tenantId` (or composite `/tenantId/type`) so list and
   per-tenant aggregations stay inside one logical partition.
2. Split write-heavy from read-heavy types, or denormalize hot read paths
   so detail pages are one query.
3. Replace the in-handler enrichment loops with single fan-in queries.
4. Use server-side `GROUP BY` for the agent-workload endpoint.
5. Add `_etag` / `ifMatch` on every update.
6. Take the lint findings seriously and let CI block them.
