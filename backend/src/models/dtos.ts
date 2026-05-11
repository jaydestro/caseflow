import { z } from 'zod';

export const caseStatus = z.enum(['open', 'pending', 'resolved', 'closed']);
export const casePriority = z.enum(['low', 'normal', 'high', 'urgent']);

export const createCaseDto = z.object({
  tenantId: z.string().min(1),
  customerId: z.string().min(1),
  assignedAgentId: z.string().min(1).nullable().optional(),
  subject: z.string().min(1).max(200),
  description: z.string().min(1),
  priority: casePriority.default('normal'),
});
export type CreateCaseDto = z.infer<typeof createCaseDto>;

export const patchCaseDto = z.object({
  status: caseStatus.optional(),
  priority: casePriority.optional(),
  assignedAgentId: z.string().min(1).nullable().optional(),
  note: z.string().optional(),
  changedBy: z.string().min(1),
});
export type PatchCaseDto = z.infer<typeof patchCaseDto>;

export const addCommentDto = z.object({
  authorId: z.string().min(1),
  authorKind: z.enum(['agent', 'customer']),
  body: z.string().min(1),
});
export type AddCommentDto = z.infer<typeof addCommentDto>;

export const listCasesQuery = z.object({
  tenantId: z.string().min(1),
  status: z.union([caseStatus, z.array(caseStatus)]).optional(),
  priority: z.union([casePriority, z.array(casePriority)]).optional(),
  agentId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListCasesQuery = z.infer<typeof listCasesQuery>;
