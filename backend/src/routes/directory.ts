import { Router } from 'express';
import { getRepositories } from '../data';
import { badRequest } from '../lib/errors';
import { DirectoryService } from '../services/directoryService';

export const directoryRouter = Router();

directoryRouter.get('/tenants', async (_req, res, next) => {
  try {
    const repos = await getRepositories();
    const svc = new DirectoryService(repos);
    res.json(await svc.listTenants());
  } catch (e) {
    next(e);
  }
});

directoryRouter.get('/agents', async (req, res, next) => {
  try {
    const tenantId = String(req.query.tenantId ?? '');
    if (!tenantId) throw badRequest('tenantId required');
    const repos = await getRepositories();
    const svc = new DirectoryService(repos);
    res.json(await svc.listAgents(tenantId));
  } catch (e) {
    next(e);
  }
});

directoryRouter.get('/customers', async (req, res, next) => {
  try {
    const tenantId = String(req.query.tenantId ?? '');
    if (!tenantId) throw badRequest('tenantId required');
    const repos = await getRepositories();
    const svc = new DirectoryService(repos);
    res.json(await svc.listCustomers(tenantId));
  } catch (e) {
    next(e);
  }
});
