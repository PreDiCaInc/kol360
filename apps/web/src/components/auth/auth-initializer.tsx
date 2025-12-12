'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { setAuthTokenFn } from '@/lib/api';

export function AuthInitializer() {
  const { getAccessToken } = useAuth();

  useEffect(() => {
    setAuthTokenFn(getAccessToken);
  }, [getAccessToken]);

  return null;
}
