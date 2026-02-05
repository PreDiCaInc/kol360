'use client';

import { useEffect, useState } from 'react';

export function EnvironmentBanner() {
  const [isTestEnvironment, setIsTestEnvironment] = useState(false);

  useEffect(() => {
    // Check at runtime using the current URL
    const hostname = window.location.hostname;
    const isTest = hostname.includes('koltest') ||
      hostname.includes('test') ||
      hostname.includes('staging') ||
      hostname.includes('localhost') ||
      hostname.includes('nba3pdn2jm'); // test web service URL identifier

    // Production domain is kol360.bio-exec.com
    const isProd = hostname === 'kol360.bio-exec.com';

    const showBanner = isTest && !isProd;
    setIsTestEnvironment(showBanner);

    // Update document title for test environment
    if (showBanner && !document.title.startsWith('[TEST]')) {
      document.title = `[TEST] ${document.title}`;
    }
  }, []);

  if (!isTestEnvironment) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-black text-center py-1 px-4 text-sm font-semibold shadow-md">
      ⚠️ TEST ENVIRONMENT - Data here is not production
    </div>
  );
}
