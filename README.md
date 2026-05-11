# CaseFlow

A small multi-tenant customer support app used as a demo workload. Tenants
("companies") manage support cases, comments, status changes, and customer
profiles.

## Stack

- **Frontend:** React + TypeScript (Vite, react-router)
- **Backend:** Node.js + TypeScript + Express
- **Database:** Azure Cosmos DB (NoSQL API) via the official `@azure/cosmos` SDK
- **Tests:** Vitest + supertest

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

By default the backend runs against an **in-memory store** so you can run the
app with no Cosmos DB connection. The API auto-seeds sample data on first boot
if the store is empty.

### Pointing at Azure Cosmos DB

Edit `backend/.env`:

```
USE_IN_MEMORY_STORE=false
COSMOS_ENDPOINT=https://localhost:8081
COSMOS_KEY=<your key, or the well-known emulator key>
COSMOS_DATABASE=caseflow
COSMOS_CONTAINER=entities
```

When the endpoint points at `localhost`/`127.0.0.1`, the backend automatically
disables TLS verification so the Cosmos DB Emulator's self-signed certificate
is accepted (dev only).

## Scripts

| Script             | Purpose                                  |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Run API + web together                   |
| `npm run dev:api`  | API only                                 |
| `npm run dev:web`  | Web only                                 |
| `npm run seed`     | Re-run the seed script against the store |
| `npm test`         | Run the backend test suite               |
| `npm run build`    | Type-check and build both packages       |

## Demo scenario

This app is intentionally realistic. It works, it has tests, it has docs, and
it looks like a normal internal SaaS tool. But the database design has the
kind of early-stage tradeoffs that quietly become problems as the product
grows.

The goal is to evaluate whether an AI coding agent, given this codebase, can:

1. Inspect the current Cosmos DB design and identify access-pattern mismatches.
2. Propose a better data model (partition strategy, container layout, denormalization).
3. Update the queries to align with the new model.
4. Improve the test suite so the new model's correctness is actually exercised.

See `docs/architecture.md`, `docs/access-patterns.md`, and
`docs/known-tradeoffs.md` for the team's current framing of the design.
