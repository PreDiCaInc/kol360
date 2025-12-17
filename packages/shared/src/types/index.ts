export type UserRole = 'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'TEAM_MEMBER';
export type UserStatus = 'PENDING_VERIFICATION' | 'PENDING_APPROVAL' | 'ACTIVE' | 'DISABLED';
export type ClientType = 'FULL' | 'LITE';
export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'PUBLISHED';
export type SurveyResponseStatus = 'PENDING' | 'OPENED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXCLUDED';
export type NominationMatchStatus = 'UNMATCHED' | 'MATCHED' | 'NEW_HCP' | 'EXCLUDED';
export type PaymentStatus = 'PENDING_EXPORT' | 'EXPORTED' | 'EMAIL_SENT' | 'EMAIL_DELIVERED' | 'EMAIL_OPENED' | 'CLAIMED' | 'BOUNCED' | 'REJECTED' | 'EXPIRED';
export type OptOutScope = 'CAMPAIGN' | 'GLOBAL';
export type QuestionType = 'TEXT' | 'NUMBER' | 'RATING' | 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'DROPDOWN' | 'MULTI_TEXT';

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
