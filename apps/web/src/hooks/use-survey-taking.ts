import { useQuery, useMutation } from '@tanstack/react-query';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SurveyQuestion {
  id: string;
  questionId: string;
  text: string;
  type: 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'RATING' | 'TEXT' | 'MULTI_TEXT';
  section: string | null;
  isRequired: boolean;
  options: string[] | null;
}

interface SurveyData {
  campaign: {
    id: string;
    name: string;
    status: string;
    honorariumAmount: number | null;
  };
  hcp: {
    firstName: string;
    lastName: string;
  };
  questions: SurveyQuestion[];
  response: {
    status: string;
    answers: Record<string, unknown>;
  } | null;
}

interface UnsubscribeInfo {
  valid: boolean;
  campaignName: string;
}

async function fetchSurvey(token: string): Promise<SurveyData> {
  const res = await fetch(`${API_BASE}/api/v1/survey/take/${token}`);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to load survey');
  }
  return res.json();
}

async function startSurvey(token: string): Promise<{ status: string; startedAt: string }> {
  const res = await fetch(`${API_BASE}/api/v1/survey/take/${token}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to start survey');
  }
  return res.json();
}

async function saveProgress(
  token: string,
  answers: Record<string, unknown>
): Promise<{ saved: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/survey/take/${token}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to save progress');
  }
  return res.json();
}

async function submitSurvey(
  token: string,
  answers: Record<string, unknown>
): Promise<{ submitted: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/survey/take/${token}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to submit survey');
  }
  return res.json();
}

async function fetchUnsubscribeInfo(token: string): Promise<UnsubscribeInfo> {
  const res = await fetch(`${API_BASE}/api/v1/unsubscribe/${token}`);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Invalid token');
  }
  return res.json();
}

async function unsubscribe(
  token: string,
  scope: 'CAMPAIGN' | 'GLOBAL',
  reason?: string
): Promise<{ optedOut: boolean; scope: string }> {
  const res = await fetch(`${API_BASE}/api/v1/unsubscribe/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, reason }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to unsubscribe');
  }
  return res.json();
}

export function useSurvey(token: string) {
  return useQuery({
    queryKey: ['survey', token],
    queryFn: () => fetchSurvey(token),
    enabled: !!token,
    retry: false,
  });
}

export function useStartSurvey() {
  return useMutation({
    mutationFn: (token: string) => startSurvey(token),
  });
}

export function useSaveProgress() {
  return useMutation({
    mutationFn: ({ token, answers }: { token: string; answers: Record<string, unknown> }) =>
      saveProgress(token, answers),
  });
}

export function useSubmitSurvey() {
  return useMutation({
    mutationFn: ({ token, answers }: { token: string; answers: Record<string, unknown> }) =>
      submitSurvey(token, answers),
  });
}

export function useUnsubscribeInfo(token: string) {
  return useQuery({
    queryKey: ['unsubscribe', token],
    queryFn: () => fetchUnsubscribeInfo(token),
    enabled: !!token,
    retry: false,
  });
}

export function useUnsubscribe() {
  return useMutation({
    mutationFn: ({
      token,
      scope,
      reason,
    }: {
      token: string;
      scope: 'CAMPAIGN' | 'GLOBAL';
      reason?: string;
    }) => unsubscribe(token, scope, reason),
  });
}
