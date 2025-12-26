'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { setAuthTokenFn } from '@/lib/api';
import { setHcpTokenFn } from '@/hooks/use-hcps';

export function AuthInitializer() {
  const { getAccessToken } = useAuth();

  useEffect(() => {
    setAuthTokenFn(getAccessToken);
    setHcpTokenFn(getAccessToken);
  }, [getAccessToken]);

  return null;
}
