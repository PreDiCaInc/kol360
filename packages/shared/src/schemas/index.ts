import { z } from 'zod';

// Base schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const idParamSchema = z.object({
  id: z.string().cuid(),
});

// Will add entity-specific schemas in subsequent modules
export * from './client';
export * from './user';
export * from './hcp';
export * from './question';
export * from './section';
export * from './survey-template';
// score-config schemas removed in Phase 3 PR A — campaign-level scoring teardown.
// DEFAULT_SCORE_WEIGHTS + the 9-component weight schema now live in kol-analysis.ts
// as analysisWeightsSchema / DEFAULT_ANALYSIS_WEIGHTS.
export * from './kol-analysis';
export * from './campaign';
export * from './distribution';
export * from './survey-taking';
export * from './response';
export * from './nomination';
export * from './dashboard';
export * from './insights-report';
export * from './insights2';
export * from './curation';
export * from './brand-affinity';
