# Access patterns

Every screen in CaseFlow boils down to one of these reads or writes.

## Reads

1. **Dashboard — list cases for a tenant by status and priority.**
   Filters: tenant (always), status (multi-select), priority (multi-select),
   assigned agent (optional), customer (optional). Sorted by `updatedAt` desc.
2. **Case detail — open one case with its comments and status history.**
   Inputs: tenant + case id. Returns the case, its comments ordered by
   `createdAt` asc, and its status events ordered by `createdAt` asc.
3. **Recent cases for a customer.**
   Inputs: tenant + customer id. Sorted by `updatedAt` desc, limit 20.
4. **Agent workload by tenant.**
   Inputs: tenant. Returns each agent and their open + pending case count.
5. **Directory lookups.** List tenants, list agents in a tenant, list
   customers in a tenant. Used to populate dropdowns.

## Writes

- Create a new case.
- Add a comment to a case.
- Update a case's status or priority (writes a `statusEvent` when status
  changes).
