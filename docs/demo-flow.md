# CaseFlow demo flow — 15 minutes

**The story:** CaseFlow is a SaaS product. Four developers rushed it to
launch — it works, tests pass, customers signed up. Six months later
**executive leadership is getting complaints from finance**: per-customer
Cosmos DB spend is climbing faster than revenue. Margins are thinning. A
few enterprise tenants are now costing more to serve than they pay.

Nobody on the team is a Cosmos expert. The code looks reasonable. The
question landing on engineering's desk from the CTO is simple: *"Why is
this so expensive, and what's the smallest change that brings the bill
down this quarter?"*

We're going to let an AI agent answer that question — first without
Cosmos expertise, then with the `cosmosdb-best-practices` skill enabled —
and watch the diagnosis go from "plausible band-aid" to "correct root
cause, with a measured RU reduction" the moment the skill turns on.

**Frame:** Inspect → Review → Correct → Test.

---

## The two beginner mistakes baked into the app

Both are things a small team without Cosmos experience would naturally
ship under deadline pressure. Both look reasonable in code review. Both
are named anti-patterns in the `cosmosdb-best-practices` skill. And both
show up directly on the invoice.

### Mistake #1 — Partition key is `/id`

[backend/src/data/cosmosStore.ts](../backend/src/data/cosmosStore.ts#L66)
creates the container with `partitionKey: { paths: ['/id'] }`. The
reasoning during the launch sprint: *"`id` is unique, partition keys
should be unique-ish, ship it."*

Why it's wrong: every query in the app filters by `tenantId` and `type`,
never by `id`. With PK = `/id`, every list/filter query fans out to every
physical partition. Diagnostics shows `crossPartition: true` on **every
single op** because of this one line. As tenants grow, partitions split,
and the per-query RU multiplier silently grows with them — which is
exactly the cost curve finance is complaining about.

### Mistake #2 — N+1 query loop in `agentWorkload`

[backend/src/services/caseService.ts](../backend/src/services/caseService.ts#L189)
computes per-agent workload procedurally:

```ts
const agents = await this.repos.listAgents(tenantId);   // 1 query
for (const a of agents) {
  const [open, pending] = await Promise.all([
    this.repos.listCases({ ..., status: ['open'],    agentId: a.id }), // +1
    this.repos.listCases({ ..., status: ['pending'], agentId: a.id }), // +1
  ]);
}
// + 2 more for unassigned
```

With 5 agents that's **13 queries per call**. The team wrote it
procedurally because that's how application code normally works, and
the dashboard polls it every few seconds per signed-in user. In a
relational ORM you'd `GROUP BY agent_id, status` and be done. Cosmos
supports the same thing server-side — they just didn't know. The biggest
tenants have the most agents, which means the most expensive customers
hit this loop hardest. That's the margin compression in one paragraph.

---

## Memorize-this cheat sheet (the on-stage script)

Six beats, in order. Everything else is decoration.

1. **Snapshot the baseline.** On Diagnostics, click **Take snapshot**.
   The traffic generator has already filled the ring buffer.
2. **Show the smoking gun, don't name the cause yet.** Read two facts
   off the Diagnostics table:
   - *"Every operation says `crossPartition: true`."*
   - *"`agentWorkload` is 13 queries per call and dominates the RU
     column."*
3. **Ask the agent — skill OFF (via prompt) — to investigate.** Use
   the §1 prompt, which explicitly tells the agent *not* to consult
   the `cosmosdb-best-practices` skill and to answer as a generalist.
   Expect plausible-sounding band-aids (cache, consistency, index,
   batching). *Don't help it.* Let the audience see generalist advice.
4. **Re-ask with the skill ON.** Say out loud: *"Same agent. Same
   codebase. Same telemetry. The only thing changing is whether the
   agent is allowed to use the Cosmos skill."* Paste the §2 prompt,
   which is identical except it tells the agent to **use** the skill.
5. **Tell the agent to fix it.** One prompt (§3). The skill drives the
   correct fix: repartition on `/tenantId` + collapse `agentWorkload`
   into one `GROUP BY` query.
6. **Replay the workload, click Compare to snapshot.** The before/after
   panel shows the delta. Read the headline number out loud.

---

## Pre-flight (do once before the demo, not on stage)

- Backend wired to live Cosmos via Entra (`COSMOS_USE_ENTRA=true`,
  ~3,897 docs seeded in `caseflow / entities`).
- Two browser tabs open: **Dashboard** and **Diagnostics**.
- Run `.\scripts\traffic-gen.ps1 -DurationMinutes 10` **before** going
  on stage so telemetry has ~200 samples and a real `agentWorkload`
  row.
- Agent chat open with the workspace loaded. The
  `cosmosdb-best-practices` skill stays **enabled** the whole time —
  we toggle it on/off *via the prompt* (see §1 and §2). Simpler, no
  window reloads, and the prompt diff is visible on screen so the
  audience sees the variable change.
- Be ready to say out loud at the pivot: *"In round one I'm telling
  the agent to ignore the skill. In real life this is exactly what
  'the developer never installed the skill' looks like — same effect,
  faster to demo."* Saying it pre-empts the "is that cheating?"
  question.
- "Break-glass" repartition script staged but unrun (see Risks).

---

## 1 · Inspect — 4 min  (skill OFF *via prompt*)

**Goal:** Audience sees the symptoms, then sees a generalist agent
struggle to name the cause.

**Stage moves:**

1. Open Diagnostics. Walk the table aloud — point at the
   `crossPartition` column (all `true`) and the `agentWorkload` row
   (highest call count and RU sum).
2. Click **Take snapshot**. State plainly: *"That's our baseline."*
3. In agent chat, paste this prompt verbatim (the leading clause is
   the "skill off" mechanic):

   > *"**For this answer, do NOT consult the `cosmosdb-best-practices`
   > skill or any Cosmos-specific guidance. Answer as a general
   > full-stack engineer who has never used Cosmos DB — focus on
   > application-level concerns like caching, indexing, and request
   > batching.**  
   > Read `backend/src/data/cosmosStore.ts`,
   > `backend/src/services/caseService.ts`, and
   > `backend/src/data/repositories.ts`. The Diagnostics page shows
   > every query is cross-partition and `agentWorkload` is firing
   > 13 queries per call. What are the top 3 problems and how would
   > you fix them?"*

4. Let the agent answer. **Expect a generalist response**: cache the
   workload result, lower consistency level, add an index, batch the
   requests. None of those are wrong exactly — they're just not the
   root cause. Don't argue, don't help. Move on.

---

## 2 · Review — 2 min  (skill ON — the pivot)

**Goal:** The pivot moment of the talk.

**Stage moves:**

1. Out loud: *"In round one I told the agent to ignore the Cosmos
   skill — same effect as a developer who never installed it. Same
   agent, same codebase, same telemetry. Now I'm going to tell it to
   use the skill. Watch the diagnosis change."*
2. Paste this prompt — identical to §1 except the leading clause flips:

   > *"**For this answer, DO consult the `cosmosdb-best-practices`
   > skill and name any anti-patterns by their proper names.**  
   > Read `backend/src/data/cosmosStore.ts`,
   > `backend/src/services/caseService.ts`, and
   > `backend/src/data/repositories.ts`. The Diagnostics page shows
   > every query is cross-partition and `agentWorkload` is firing
   > 13 queries per call. What are the top 3 problems and how would
   > you fix them?"*

   Optional flourish: keep both prompts visible side-by-side so the
   audience can see the *only* difference is the leading clause.

**Expect the diagnosis to change.** The skill teaches the agent to
name the anti-patterns by their real names:

- Partition key `/id` with no query ever filtering by `id` → classic
  cross-partition fan-out anti-pattern.
- `agentWorkload` procedural loop → N+1 anti-pattern; Cosmos supports
  `GROUP BY` server-side, do it in one query.

3. Lock the success condition out loud: *"≥5× RU reduction on
   `agentWorkload`, `crossPartition: false` on dashboard list,
   measured on the Diagnostics compare panel."*

---

## 3 · Correct — 5 min  (tell the agent to apply the fix)

**Goal:** Agent applies both fixes with skill guidance.

**Stage prompt:**

> *"Apply both fixes the skill flagged.
> (1) Repartition `entities` on `/tenantId` via a one-shot migration
> script that creates `entities_v2`, copies docs, and switches the app
> via the `COSMOS_CONTAINER` env var.
> (2) Collapse `agentWorkload` into a single `GROUP BY` query.
> Update `get()` so point reads pass `tenantId` as the partition-key
> value. Show me a diff before applying."*

**Expected changes:**

- `scripts/repartition.ts` — reads from `entities`, writes to
  `entities_v2` with `partitionKey: { paths: ['/tenantId'] }`.
- [cosmosStore.ts](../backend/src/data/cosmosStore.ts) `init()`
  partition-key change (driven by `COSMOS_CONTAINER`).
- [cosmosStore.ts](../backend/src/data/cosmosStore.ts) `get()` signature
  takes `tenantId` so point reads use the right PK value.
- [repositories.ts](../backend/src/data/repositories.ts) `listCases`
  passes `partitionKey: opts.tenantId` so the SDK scopes to one logical
  partition.
- [caseService.ts](../backend/src/services/caseService.ts)
  `agentWorkload` becomes one query:

  ```sql
  SELECT c.assignedAgentId, c.status, COUNT(1) AS cnt
  FROM c
  WHERE c.type = 'case' AND c.tenantId = @tid
    AND c.status IN ('open', 'pending')
  GROUP BY c.assignedAgentId, c.status
  ```

Approve, run migration, flip env, restart. ~3,897 docs copy in seconds.

---

## 4 · Test — 3 min  (measured before/after)

**Goal:** Same workload, before vs after, on screen.

**Stage moves:**

1. Re-run the traffic generator for ~60s, or click Dashboard +
   agent-workload a handful of times.
2. On Diagnostics, click **Compare to snapshot**. The before/after
   panel renders the delta automatically.
3. Read the headline aloud: *"`agentWorkload` went from 13
   cross-partition queries at ~37 RU per call to 1 single-partition
   query at ~3 RU. Same answer, ~90% less spend."*

| Metric                | Before (`/id`, N+1) | After (`/tenantId`, `GROUP BY`) |
|-----------------------|---------------------|---------------------------------|
| `agentWorkload` calls | 13 queries/call     | **1 query/call**                |
| `agentWorkload` RU    | ~37 RU/call         | ~3 RU/call                      |
| Dashboard list RU     | ~85 RU              | ~3–5 RU                         |
| `crossPartition`      | true (every op)     | **false**                       |
| p50 latency           | ~120–200 ms         | ~10–25 ms                       |

(Numbers illustrative — replace with the live readings.)

4. Final agent prompt to close the loop:
   > *"Summarize what we changed, the measured delta, and two
   > follow-ups for next sprint."*

Good follow-ups the skill should surface:

- Composite index for case-list filters (`tenantId`, `status`,
  `assignedAgentId`).
- `_etag` / `ifMatch` on case updates (lost-update issue in
  [known-tradeoffs.md](./known-tradeoffs.md)).

---

## 1-minute wrap

Anchor the meta-point — bring it back to the exec frame:

- Same agent. Same codebase. Same telemetry. The only thing that
  changed between "plausible band-aid" and "correct root cause" was
  enabling the `cosmosdb-best-practices` skill.
- The CTO's question was *"what's the smallest change that brings the
  bill down this quarter?"* — and the skill-enabled agent answered it
  with a measured RU reduction the team can take straight to finance.
- Skills turn a generalist coding agent into a specialist reviewer.
  When the four developers who built CaseFlow get this skill in their
  agent on day one, the wrong partition key and the N+1 loop never
  ship — the margin problem never exists.
- Inspect → Review → Correct → Test works because Cosmos exposes RU +
  diagnostics that make "better" a number, not an opinion.

---

## Risks / things to rehearse

- **Skill-off agent surprises you and *does* find the partition-key
  issue.** Possible. If it happens, lean in: *"OK, it caught one.
  Did it catch the N+1?"* It almost never catches both without the
  skill — pivot on whichever one it missed.
- **Skill-on agent suggests a different fix order** (e.g., collapse
  `agentWorkload` first, repartition second). Fine. The point is the
  diagnosis is now correct.
- **Repartition timing.** Rehearse the migration once. ~3,897 docs
  should be sub-30s, but Entra token acquisition can add a beat on
  first call after a cold start.
- **Do not pre-fix anything.** The audience needs to see
  `crossPartition: true` on screen first.
- **Break-glass:** keep a pre-tested `scripts/repartition.ts` and a
  pre-created `entities_v2` container on disk but unrun. If the live
  generation drifts, fall back to running the staged script and
  flipping `COSMOS_CONTAINER=entities_v2`.

---

## Reference — current env

- Subscription: `CosmosDB-Demos-GeneralUse`
- Resource group: `rg-aicodingsummit-demo`
- Account: `cosmos-aisummit-jagord` (eastus, serverless, local-auth
  disabled)
- Endpoint: `https://cosmos-aisummit-jagord.documents.azure.com:443/`
- DB / container: `caseflow / entities` (pk `/id`)
- Auth: `DefaultAzureCredential`, Data Contributor on the signed-in user
