# CaseFlow

CaseFlow is the internal multi-tenant support app built by **Northstar Helpdesk**,
a Series-A B2B SaaS that sells a white-labelled help-desk product to small
companies. Three tenants are live in production today: Contoso (their largest
customer, ~900 closed cases of history), Northwind, and Fabrikam.

This repo is the v1 build. It was written by a 4-engineer team in 8 weeks to
hit a launch date. None of them had used Cosmos DB before. The app works, it
has tests, it has docs, and it has been in production for 18 months.

It is also slow, expensive, and quietly broken in ways nobody on the team has
had time to chase down. The on-call rotation has a running joke that the
dashboard "takes a sip of coffee" to load. The Cosmos bill grew faster than
the customer count. A junior engineer noticed last week that two simultaneous
PATCH requests to the same case can lose one of the updates.

Northstar's CTO has asked an AI coding agent to take a pass over the
codebase: not just the database, but the TypeScript and Node code around it
too. The deliverable for the on-stage demo is a prioritized list of real
problems the agent can find and fix, backed by tooling output and behavioral
evidence — not vibes.

## Stack

- **Frontend:** React + TypeScript (Vite, react-router)
- **Backend:** Node.js + TypeScript + Express
- **Database:** Azure Cosmos DB (NoSQL API) via the official `@azure/cosmos` SDK
- **Tests:** Vitest + supertest
- **Lint:** ESLint + `@typescript-eslint` with type-aware rules

## Local setup

Requires Node 20+.

```bash
npm install
cp backend/.env.example backend/.env  # then edit if you want
npm run dev
```

This starts:

- API on http://localhost:4000
- Web on http://localhost:5173 (proxies `/api` to the API)
- A **Diagnostics** page at http://localhost:5173/diagnostics that shows the
  most recent queries, their RU cost, latency, and whether they crossed
  partitions

By default the backend connects to the **Cosmos DB Emulator** on
`https://localhost:8081` using the well-known emulator key, so the demo works
out of the box with a local emulator running.

### Pointing at Azure Cosmos DB

Edit `backend/.env`:

```
COSMOS_ENDPOINT=https://localhost:8081
COSMOS_KEY=<your key, or leave blank for the well-known emulator key>
COSMOS_DATABASE=caseflow
COSMOS_CONTAINER=entities
```

## Scripts

| Script             | Purpose                                  |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Run API + web together                   |
| `npm run dev:api`  | API only                                 |
| `npm run dev:web`  | Web only                                 |
| `npm run seed`     | Re-run the seed script against the store |
| `npm test`         | Run the backend test suite               |
| `npm run lint`     | ESLint (backend)                         |
| `npm run build`    | Type-check and build both packages       |

## Demo scenario

The app looks normal. The AI coding agent's job is to use the tools available
to it — `tsc`, `eslint`, the Diagnostics page, the test suite, log output —
to identify and fix the problems Northstar has been living with. The
problems fall into three buckets:

### 1. Database design and query problems

- Single `entities` container holds every document type. List queries scan
  tenants, agents, customers, comments, and status events along the way.
- Partition key is `/id`. Every list query is therefore cross-partition.
- N+1 enrichment in `getCaseDetail` — one point read per comment author and
  per status-event actor.
- N+1 queries in `agentWorkload` — one open + one pending query per agent.
- Application-side tenant filtering instead of a tenant-aware partition.

These surface on the Diagnostics page as: cross-partition counts climbing,
RU/op rising with seed size, and per-endpoint latency in the hundreds of ms.

### 2. Cosmos SDK / configuration problems

- `consistencyLevel: 'Strong'` pinned at the client. Northstar's workload is
  fine with session consistency; Strong inflates RU cost for no benefit.
- The well-known emulator key is hard-coded as a fallback in
  `cosmosStore.ts`. It's only the emulator key, but committing keys at all
  is a pattern the agent should call out.
- `fs.readFileSync` of `package.json` in the SDK client constructor — a
  synchronous file read on the hot path of every cold start.
- No optimistic concurrency on writes: `updateCase` does a read → mutate →
  upsert with no `_etag` / `ifMatch`. Two concurrent PATCHes lose one.
- The audit-log write in `createCase` is fire-and-forget (`void`) — if it
  throws there is no surface, and the audit trail silently drops records.

### 3. TypeScript / Node code-quality problems

The repo has ESLint configured with type-aware rules. `npm run lint` from
`backend/` currently reports **15 errors and 12 warnings**:

- `@typescript-eslint/no-misused-promises` — every Express route hands an
  `async` handler straight to Express, which doesn't await the returned
  promise. Errors that escape after the first `await` go unhandled.
- `eqeqeq` violation in the tenant guard inside `updateCase` (`!=` instead
  of `!==`).
- `no-floating-promises` — the audit write in `createCase`.
- `no-console` — leftover debug `console.log` calls in `caseService`.
- `no-explicit-any` / `no-unsafe-*` — `as any` casts around the Cosmos SDK
  query type and route handlers.
- `setInterval` cache-warmer in `app.ts` is never cleared, so it keeps the
  event loop alive in tests and accumulates across `createApp()` calls.
- Wide-open `cors()` with a comment claiming "we're inside the VPC."
- `feature-flags.json` is loaded with `fs.readFileSync` at module load.

The on-stage flow the demo is built for:

1. Run `npm run lint` → see the 27 findings. Triage which are real.
2. Open the Diagnostics page → see RU and cross-partition counts climb as
   you click around the app.
3. Ask the agent to propose a partition-key change and a query rewrite.
4. Ask the agent to fix the race in `updateCase` with `_etag`/`ifMatch`.
5. Ask the agent to harden the SDK client (drop Strong, remove the hard-coded
   key, move the `readFileSync`).
6. Re-run lint and the diagnostics page to confirm the fixes hold.

See `docs/architecture.md`, `docs/access-patterns.md`, and
`docs/known-tradeoffs.md` for the v1 team's own framing of the design.
