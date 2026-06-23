# CaseFlow — an educational Azure Cosmos DB sample

> **What this is.** CaseFlow is an **educational tool** for people learning
> Azure Cosmos DB. It is a deliberately flawed sample app, seeded with common
> Cosmos DB anti-patterns (plus a few TypeScript/Node code smells), so you can
> practice **spotting potential problems and applying the fixes** with the help
> of the **[Azure Cosmos DB Agent Kit](https://github.com/AzureCosmosDB/cosmosdb-agent-kit)**.
>
> **What this is not.** This is **not** production software and is **not** a
> template to build a real app on. The slow queries, insecure defaults, and
> correctness bugs in this repo are *intentional teaching material* — do not
> copy them into anything real.

## How to use it

1. **Install the Cosmos DB Agent Kit globally** so your AI coding agent gains
   the Cosmos DB best-practice skills. The kit is intentionally **not** vendored
   into this repo — it changes often, so always install it fresh:

   ```bash
   npx skills add AzureCosmosDB/cosmosdb-agent-kit
   ```

2. **Run the app locally** (see *Local setup* below).

3. **Ask your agent to review the code and the running Diagnostics page.** With
   the agent kit installed it can recognise the intentional Cosmos DB
   anti-patterns, explain *why* each one hurts, and propose a fix. The goal of
   the exercise is to find and fix the problems below.

## The scenario

To make the exercise concrete, the sample is dressed up as a small fictional
multi-tenant help-desk called CaseFlow, with three sample tenants — Contoso,
Northwind, and Fabrikam. The code is written to *look* like an ordinary first
build while hiding the kinds of problems teams accumulate when they are new to
Cosmos DB: it is slow, it is expensive, and it has a couple of subtle
correctness bugs. Finding and fixing them is the point.

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

## What to look for

The app looks normal. Your job (with the agent kit helping) is to use the
tools available — `tsc`, `eslint`, the Diagnostics page, the test suite, log
output — to identify and fix the intentional problems. They fall into three
buckets:

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

- `consistencyLevel: 'Strong'` pinned at the client. This workload is
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

A suggested walkthrough:

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
