'use client';

export function EnvironmentBanner() {
  const isProduction = process.env.NODE_ENV === 'production' &&
    !process.env.NEXT_PUBLIC_API_URL?.includes('test') &&
    !process.env.NEXT_PUBLIC_API_URL?.includes('staging');

  // Also check if the API URL contains test/staging indicators
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const isTestEnvironment = apiUrl.includes('test') ||
    apiUrl.includes('staging') ||
    apiUrl.includes('mpcu4inmtj'); // test API URL identifier

  // Don't show banner in production
  if (isProduction && !isTestEnvironment) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-black text-center py-1 px-4 text-sm font-semibold shadow-md">
      ⚠️ TEST ENVIRONMENT - Data here is not production
    </div>
  );
}
