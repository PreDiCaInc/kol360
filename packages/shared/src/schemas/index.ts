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
export * from './score-config';
