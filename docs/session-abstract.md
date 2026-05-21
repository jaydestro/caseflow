# Session Abstract

The CaseFlow team shipped in eight weeks to hit a launch date. Eighteen months
later the dashboard "takes a sip of coffee" to load, and the document database
bill is bigger than the customer base. That is the on-call joke at Northstar
Helpdesk.

Northstar is a Series-A B2B SaaS, and CaseFlow is their internal support app.
The team picked a NoSQL document store, Azure Cosmos DB, and shipped. None of
them had used it before. It works. It has tests. It has docs. It is also slow,
expensive, and quietly broken. A junior engineer noticed last week that two
simultaneous PATCH requests against the same case can lose one of the updates.
Nobody wants a rewrite.

In this 20-minute talk we run an AI coding agent across the codebase live. The
agent has domain-specific skills for the database, TypeScript, and React, and it
uses them to detect design flaws in a four-phase flow you can take home:
inspect, review, correct, test. We work the levers that actually move RU and
latency on a NoSQL document store, namely the data model, the partition key, the
indexing policy, and the query. The agent proposes. We push back. It proposes
again. We validate in the platform's built-in metrics on the same workload.

You will not see a rewrite. You will see a feedback loop. That is the point.
