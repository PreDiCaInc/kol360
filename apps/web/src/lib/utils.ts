import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Display-only Title Case for proper nouns (city names, etc.) so the UI is
 * consistent regardless of how the underlying data was capitalized at import
 * time ("BOSTON" / "boston" / "Boston" all render as "Boston"). Doesn't try
 * to handle Mc/Mac/St. — those are rare enough that simple Title Case is
 * close enough, and applying it everywhere is preferable to inconsistent
 * mixed-case across tables.
 */
export function toTitleCase(s: string | null | undefined): string | null {
  if (!s) return null;
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
