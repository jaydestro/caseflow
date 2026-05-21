import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  const dataMod = await import('../src/data');
  dataMod._resetForTests();
  const { createApp } = await import('../src/app');
  const repos = await dataMod.getRepositories();
  const { runSeedIfEmpty } = await import('../src/scripts/seed');
  await runSeedIfEmpty(repos);
  app = createApp();
});

describe('CaseFlow API', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('lists tenants and cases for a tenant', async () => {
    const tenants = await request(app).get('/api/tenants');
    expect(tenants.status).toBe(200);
    expect(tenants.body.length).toBeGreaterThan(0);
    const tenantId = tenants.body[0].id;
    const cases = await request(app).get(`/api/cases?tenantId=${tenantId}`);
    expect(cases.status).toBe(200);
    expect(Array.isArray(cases.body.items)).toBe(true);
    expect(cases.body.items.length).toBeGreaterThan(0);
  });

  it('filters cases by status', async () => {
    const tenants = await request(app).get('/api/tenants');
    const tenantId = tenants.body[0].id;
    const open = await request(app).get(`/api/cases?tenantId=${tenantId}&status=open`);
    expect(open.status).toBe(200);
    for (const c of open.body.items) expect(c.status).toBe('open');
  });

  it('create → comment → status workflow', async () => {
    const tenants = await request(app).get('/api/tenants');
    const tenantId = tenants.body[0].id;
    const customers = await request(app).get(`/api/customers?tenantId=${tenantId}`);
    const agents = await request(app).get(`/api/agents?tenantId=${tenantId}`);
    const created = await request(app).post('/api/cases').send({
      tenantId,
      customerId: customers.body[0].id,
      assignedAgentId: agents.body[0].id,
      subject: 'Test case',
      description: 'something is broken',
      priority: 'high',
    });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const commented = await request(app)
      .post(`/api/cases/${id}/comments?tenantId=${tenantId}`)
      .send({ authorId: agents.body[0].id, authorKind: 'agent', body: 'looking now' });
    expect(commented.status).toBe(201);

    const patched = await request(app)
      .patch(`/api/cases/${id}?tenantId=${tenantId}`)
      .send({ status: 'pending', changedBy: agents.body[0].id });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe('pending');

    const detail = await request(app).get(`/api/cases/${id}?tenantId=${tenantId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.case.id).toBe(id);
    expect(detail.body.comments.length).toBe(1);
    expect(detail.body.statusEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('returns 404 for unknown case', async () => {
    const tenants = await request(app).get('/api/tenants');
    const tenantId = tenants.body[0].id;
    const res = await request(app).get(`/api/cases/does-not-exist?tenantId=${tenantId}`);
    expect(res.status).toBe(404);
  });

  it('agent workload returns rows', async () => {
    const tenants = await request(app).get('/api/tenants');
    const tenantId = tenants.body[0].id;
    const res = await request(app).get(`/api/cases/_/agent-workload?tenantId=${tenantId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('records telemetry samples for queries', async () => {
    await request(app).post('/api/_diagnostics/clear');
    const tenants = await request(app).get('/api/tenants');
    const tenantId = tenants.body[0].id;
    await request(app).get(`/api/cases?tenantId=${tenantId}`);
    const diag = await request(app).get('/api/_diagnostics/queries');
    expect(diag.status).toBe(200);
    expect(diag.body.summary.count).toBeGreaterThan(0);
    expect(diag.body.samples.length).toBeGreaterThan(0);
    // The list-cases query should be flagged as cross-partition.
    expect(diag.body.samples.some((s: any) => s.crossPartition)).toBe(true);
  });
});

afterAll(() => {
  /* nothing */
});
