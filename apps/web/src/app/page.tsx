'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [showTimeout, setShowTimeout] = useState(false);

  // Redirect based on auth state
  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/admin');
      } else {
        router.replace('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  // Show timeout message after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowTimeout(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4" />
      <h1 className="text-4xl font-bold">KOL360</h1>
      <p className="mt-4 text-gray-600">Loading...</p>
      {showTimeout && (
        <button
          onClick={() => router.push('/login')}
          className="mt-4 text-sm text-primary underline hover:no-underline"
        >
          Go to login
        </button>
      )}
    </main>
  );
}
