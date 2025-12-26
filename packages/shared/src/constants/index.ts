export const USER_ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  CLIENT_ADMIN: 'CLIENT_ADMIN',
  TEAM_MEMBER: 'TEAM_MEMBER',
} as const;

export const CLIENT_TYPES = {
  FULL: 'FULL',
  LITE: 'LITE',
} as const;

export const CAMPAIGN_STATUSES = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  PUBLISHED: 'PUBLISHED',
} as const;

export const SURVEY_RESPONSE_STATUSES = {
  PENDING: 'PENDING',
  OPENED: 'OPENED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export const NOMINATION_MATCH_STATUSES = {
  UNMATCHED: 'UNMATCHED',
  MATCHED: 'MATCHED',
  NEW_HCP: 'NEW_HCP',
  EXCLUDED: 'EXCLUDED',
} as const;

export const PAYMENT_STATUSES = {
  PENDING_EXPORT: 'PENDING_EXPORT',
  EXPORTED: 'EXPORTED',
  EMAIL_SENT: 'EMAIL_SENT',
  EMAIL_DELIVERED: 'EMAIL_DELIVERED',
  EMAIL_OPENED: 'EMAIL_OPENED',
  CLAIMED: 'CLAIMED',
  BOUNCED: 'BOUNCED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;

export const OPT_OUT_SCOPES = {
  CAMPAIGN: 'CAMPAIGN',
  GLOBAL: 'GLOBAL',
} as const;

export const QUESTION_TYPES = {
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  RATING: 'RATING',
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  MULTI_CHOICE: 'MULTI_CHOICE',
  DROPDOWN: 'DROPDOWN',
  MULTI_TEXT: 'MULTI_TEXT',
} as const;

export const DISEASE_AREAS = [
  { code: 'RETINA', name: 'Retina', therapeuticArea: 'Ophthalmology' },
  { code: 'DRY_EYE', name: 'Dry Eye', therapeuticArea: 'Ophthalmology' },
  { code: 'GLAUCOMA', name: 'Glaucoma', therapeuticArea: 'Ophthalmology' },
  { code: 'CORNEA', name: 'Cornea', therapeuticArea: 'Ophthalmology' },
] as const;
