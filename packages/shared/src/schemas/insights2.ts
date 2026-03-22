import { z } from 'zod';

// Distribution item with count and percentage
export const demographicDistributionItemSchema = z.object({
  name: z.string(),
  count: z.number(),
  percentage: z.number(),
});

export type DemographicDistributionItem = z.infer<typeof demographicDistributionItemSchema>;

// Educational resource rank distribution
export const educationalResourceItemSchema = z.object({
  resource: z.string(),
  rank1: z.number(),
  rank2: z.number(),
  rank3: z.number(),
  rank4: z.number(),
  rank5: z.number(),
});

export type EducationalResourceItem = z.infer<typeof educationalResourceItemSchema>;

// Core focus by patients cross-tabulation
export const coreFocusByPatientsItemSchema = z.object({
  coreFocus: z.string(),
  totalPatients: z.number(),
  count: z.number(),
});

export type CoreFocusByPatientsItem = z.infer<typeof coreFocusByPatientsItemSchema>;

// Demographics response
export const demographicsResponseSchema = z.object({
  totalRespondents: z.number(),
  byRole: z.array(demographicDistributionItemSchema),
  byPracticeSetting: z.array(demographicDistributionItemSchema),
  byCoreFocus: z.array(demographicDistributionItemSchema),
  byMonthlyPatients: z.array(demographicDistributionItemSchema),
  byDedPatients: z.array(demographicDistributionItemSchema),
  byYearsInPractice: z.array(demographicDistributionItemSchema),
  byState: z.array(demographicDistributionItemSchema),
  byDecile: z.array(demographicDistributionItemSchema),
  educationalResources: z.array(educationalResourceItemSchema),
  educationalResourcesAcademic: z.array(educationalResourceItemSchema),
  educationalResourcesOther: z.array(educationalResourceItemSchema),
  topicsDiscussed: z.array(demographicDistributionItemSchema).optional(),
  coreFocusByPatients: z.array(coreFocusByPatientsItemSchema),
});

export type DemographicsResponse = z.infer<typeof demographicsResponseSchema>;

// KOL nomination metadata - distribution item without percentage
export const nominationDistributionItemSchema = z.object({
  name: z.string(),
  count: z.number(),
});

export type NominationDistributionItem = z.infer<typeof nominationDistributionItemSchema>;

// Nominator detail item
export const nominatorDetailItemSchema = z.object({
  name: z.string(),
  role: z.string(),
  practiceSetting: z.string(),
  coreFocus: z.string(),
  state: z.string(),
  city: z.string(),
  totalNominations: z.number(),
});

export type NominatorDetailItem = z.infer<typeof nominatorDetailItemSchema>;

// KOL nomination metadata response
export const kolNominationMetadataResponseSchema = z.object({
  byPracticeSetting: z.array(nominationDistributionItemSchema),
  byCoreFocus: z.array(nominationDistributionItemSchema),
  byMonthlyPatients: z.array(nominationDistributionItemSchema),
  byDedPatients: z.array(nominationDistributionItemSchema),
  byYearsInPractice: z.array(nominationDistributionItemSchema),
  byDecile: z.array(nominationDistributionItemSchema),
  topicsDiscussed: z.array(nominationDistributionItemSchema).optional(),
  nominators: z.array(nominatorDetailItemSchema),
});

export type KolNominationMetadataResponse = z.infer<typeof kolNominationMetadataResponseSchema>;
