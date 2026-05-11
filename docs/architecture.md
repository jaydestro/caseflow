# Architecture

CaseFlow is a small multi-tenant support tool. The backend is a stateless
Express service; persistence is Azure Cosmos DB (NoSQL API).

## Containers

We run a single container, `entities`, in the `caseflow` database.

The container holds every entity type the app cares about — tenants, agents,
customers, support cases, comments, and status events. Each document carries
a `type` discriminator so services can route it.

The container is partitioned on `/id`. We chose `/id` because it gives us the
most even partition distribution: every document has a unique id, so writes
spread perfectly across logical partitions. This avoids the hot-partition
problems we'd see if we partitioned on something like `/tenantId`.

## Document shape

Every document has:

- `id` — globally unique
- `type` — `"tenant" | "agent" | "customer" | "case" | "comment" | "statusEvent"`
- `tenantId` — owning tenant
- `createdAt`, `updatedAt`

Type-specific fields live alongside.

## Service layer

The API is split into routes → services → repositories. Services do tenant
filtering before returning data to the routes, which keeps the data layer
simple and reusable across tenants. We can filter tenant data in the service
layer.

## Frontend

A small Vite + React app under `frontend/`. It uses a tenant switcher in the
top bar, then talks to `/api/*` for everything. State is request-driven; we
don't keep a long-lived client cache yet.
