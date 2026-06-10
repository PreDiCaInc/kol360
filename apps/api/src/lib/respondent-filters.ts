// v1.17.31 — query-string → typed respondent filter object.
//
// Extracted from routes/insights-report.ts so the parser has a unit
// test surface (see __tests__/respondent-filters.test.ts) without
// needing to bootstrap Fastify.
//
// Categorical filters accept EITHER:
//   - repeated query params: ?coreFocuses=A&coreFocuses=B  (Fastify
//     decodes into string[])
//   - a single string:        ?coreFocuses=A               (decodes as
//     a single string, treated as a 1-element array)
//
// They do NOT comma-split. Background: a single CSV string like
// "Dry Eye (including OSD, MGD, and NK)" was being shredded by the
// previous split(',') into ["Dry Eye (including OSD", "MGD", ...].
// See docs/findings/splitcsv-comma-bug-2026-06-09.md.

export interface ParsedRespondentFilters {
  respondentRoles?: string[];
  coreFocuses?: string[];
  stateOfPractices?: string[];
  practiceSettings?: string[];
  yearsMin?: number;
  yearsMax?: number;
  monthlyPatientsMin?: number;
  monthlyPatientsMax?: number;
  dedPatientsMin?: number;
  dedPatientsMax?: number;
}

function toArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  const arr = Array.isArray(v) ? v : [v];
  const cleaned = arr.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

function num(v: string | string[] | undefined): number | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === undefined || s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function parseRespondentFilters(
  q: Record<string, string | string[] | undefined>
): ParsedRespondentFilters {
  return {
    respondentRoles: toArray(q.respondentRoles) ?? toArray(q.respondentRole),
    coreFocuses: toArray(q.coreFocuses) ?? toArray(q.coreFocus),
    stateOfPractices: toArray(q.stateOfPractices) ?? toArray(q.stateOfPractice),
    practiceSettings: toArray(q.practiceSettings) ?? toArray(q.practiceSetting),
    yearsMin: num(q.yearsMin),
    yearsMax: num(q.yearsMax),
    monthlyPatientsMin: num(q.monthlyPatientsMin),
    monthlyPatientsMax: num(q.monthlyPatientsMax),
    dedPatientsMin: num(q.dedPatientsMin),
    dedPatientsMax: num(q.dedPatientsMax),
  };
}
