import { Router } from 'express';
import { getRepositories } from '../data';
import { badRequest } from '../lib/errors';
import {
  addCommentDto,
  createCaseDto,
  listCasesQuery,
  patchCaseDto,
} from '../models/dtos';
import { CaseService } from '../services/caseService';

export const casesRouter = Router();

function svc() {
  return getRepositories().then((r) => new CaseService(r));
}

casesRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listCasesQuery.parse(req.query);
    const s = await svc();
    const items = await s.listCases(parsed);
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

casesRouter.get('/_/agent-workload', async (req, res, next) => {
  try {
    const tenantId = String(req.query.tenantId ?? '');
    if (!tenantId) throw badRequest('tenantId required');
    const s = await svc();
    res.json(await s.agentWorkload(tenantId));
  } catch (e) {
    next(e);
  }
});

casesRouter.get('/:id', async (req, res, next) => {
  try {
    const tenantId = String(req.query.tenantId ?? '');
    if (!tenantId) throw badRequest('tenantId required');
    const s = await svc();
    res.json(await s.getCaseDetail(tenantId, req.params.id));
  } catch (e) {
    next(e);
  }
});

casesRouter.post('/', async (req, res, next) => {
  try {
    const dto = createCaseDto.parse(req.body);
    const s = await svc();
    const created = await s.createCase(dto);
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

casesRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = req.body as { tenantId?: unknown };
    const tenantId = String(req.query.tenantId ?? body.tenantId ?? '');
    if (!tenantId) throw badRequest('tenantId required');
    const dto = patchCaseDto.parse(req.body);
    const s = await svc();
    res.json(await s.updateCase(tenantId, req.params.id, dto));
  } catch (e) {
    next(e);
  }
});

casesRouter.post('/:id/comments', async (req, res, next) => {
  try {
    const body = req.body as { tenantId?: unknown };
    const tenantId = String(req.query.tenantId ?? body.tenantId ?? '');
    if (!tenantId) throw badRequest('tenantId required');
    const dto = addCommentDto.parse(req.body);
    const s = await svc();
    const created = await s.addComment(tenantId, req.params.id, dto);
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});
