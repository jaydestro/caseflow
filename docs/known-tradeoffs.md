# Known tradeoffs (v1)

We made a handful of conscious tradeoffs to ship v1 quickly. They are listed
here so future maintainers know what we already debated.

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

We accept that cross-document reads (the dashboard list, the case detail
fan-out) cross logical partitions. v1 traffic is low enough that this is not
yet visible in latency.

## Tenant filtering in the service layer

Repositories don't take a tenant argument. Services filter on `tenantId`
before returning to routes. This keeps repository code reusable and avoids
forcing a tenant-shaped API on every helper.

## Application-side composition

A few endpoints (notably the agent-workload endpoint) pull a working set out
of the database and group/aggregate in Node. SQL is expressive enough to do
this server-side, but the Node version was easier to get right and easier to
unit-test. We'd revisit if the working set grows past ~10k rows per tenant.
