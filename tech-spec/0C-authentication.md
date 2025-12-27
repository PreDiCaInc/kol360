# Module 0C: Authentication (AWS Cognito)

## Objective
Integrate AWS Cognito for authentication with JWT validation in Fastify and auth context in Next.js.

## Prerequisites
- Modules 0A and 0B completed
- AWS account with Cognito access

---

## AWS Cognito Setup

### User Pool Configuration

Create via AWS Console or CDK:

| Setting | Value |
|---------|-------|
| Pool Name | `kol360-users` |
| Sign-in | Email |
| Password Policy | Min 8, upper, lower, number, symbol |
| MFA | Optional |
| Email Verification | Required |
| Account Status | Disabled on signup (manual approval) |

### Custom Attributes

| Attribute | Type | Mutable |
|-----------|------|---------|
| `tenant_id` | String | Yes |
| `role` | String | Yes |

### User Groups

- `platform-admins`
- `client-admins`
- `team-members`

---

## Backend Implementation

### Install Dependencies

```bash
cd apps/api
pnpm add aws-jwt-verify @aws-sdk/client-cognito-identity-provider
```

### Auth Plugin

`apps/api/src/plugins/auth.ts`:

```typescript
import fp from 'fastify-plugin';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { FastifyRequest, FastifyReply } from 'fastify';

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  clientId: process.env.COGNITO_CLIENT_ID!,
  tokenUse: 'access',
});

export interface AuthUser {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/health',
  '/api/v1/auth/signup',
  '/api/v1/auth/login',
  '/api/v1/survey/take', // Public survey taking
];

function isPublicRoute(url: string): boolean {
  return PUBLIC_ROUTES.some(route => url.startsWith(route));
}

export const authPlugin = fp(async (fastify) => {
  fastify.decorateRequest('user', null);

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public routes
    if (isPublicRoute(request.url)) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
        statusCode: 401
      });
    }

    try {
      const token = authHeader.split(' ')[1];
      const payload = await verifier.verify(token);
      
      request.user = {
        sub: payload.sub,
        email: payload.email as string,
        role: (payload['custom:role'] as string) || 'TEAM_MEMBER',
        tenantId: payload['custom:tenant_id'] as string | undefined,
      };
    } catch (err) {
      fastify.log.warn({ err }, 'Token verification failed');
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        statusCode: 401
      });
    }
  });
});
```

### RBAC Middleware

`apps/api/src/middleware/rbac.ts`:

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@kol360/shared';

export function requireAuth() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'Authentication required',
        statusCode: 401
      });
    }
  };
}

export function requireRole(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'Authentication required',
        statusCode: 401
      });
    }
    
    if (!allowedRoles.includes(request.user.role as UserRole)) {
      return reply.status(403).send({ 
        error: 'Forbidden',
        message: 'Insufficient permissions',
        statusCode: 403
      });
    }
  };
}

export function requirePlatformAdmin() {
  return requireRole('PLATFORM_ADMIN');
}

export function requireClientAdmin() {
  return requireRole('PLATFORM_ADMIN', 'CLIENT_ADMIN');
}

export function requireTenantAccess(getTenantId: (request: FastifyRequest) => string | undefined) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized', statusCode: 401 });
    }

    // Platform admins can access all tenants
    if (request.user.role === 'PLATFORM_ADMIN') {
      return;
    }

    const requestedTenantId = getTenantId(request);
    if (requestedTenantId && request.user.tenantId !== requestedTenantId) {
      return reply.status(403).send({ 
        error: 'Forbidden',
        message: 'Cannot access other tenant data',
        statusCode: 403
      });
    }
  };
}
```

### Cognito Service

`apps/api/src/services/cognito.service.ts`:

```typescript
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION || 'us-east-1',
});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

export class CognitoService {
  /**
   * Create a new user in Cognito (disabled by default)
   */
  async createUser(email: string, tempPassword?: string) {
    const command = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      TemporaryPassword: tempPassword,
      MessageAction: tempPassword ? 'SUPPRESS' : undefined,
    });

    const result = await client.send(command);
    return result.User;
  }

  /**
   * Enable a user (after approval)
   */
  async enableUser(username: string) {
    const command = new AdminEnableUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });
    await client.send(command);
  }

  /**
   * Disable a user
   */
  async disableUser(username: string) {
    const command = new AdminDisableUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });
    await client.send(command);
  }

  /**
   * Update user's custom attributes
   */
  async updateUserAttributes(username: string, attributes: { role?: string; tenantId?: string }) {
    const userAttributes = [];
    
    if (attributes.role) {
      userAttributes.push({ Name: 'custom:role', Value: attributes.role });
    }
    if (attributes.tenantId) {
      userAttributes.push({ Name: 'custom:tenant_id', Value: attributes.tenantId });
    }

    if (userAttributes.length === 0) return;

    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: userAttributes,
    });
    await client.send(command);
  }

  /**
   * Add user to a Cognito group
   */
  async addUserToGroup(username: string, groupName: string) {
    const command = new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      GroupName: groupName,
    });
    await client.send(command);
  }

  /**
   * Remove user from a Cognito group
   */
  async removeUserFromGroup(username: string, groupName: string) {
    const command = new AdminRemoveUserFromGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      GroupName: groupName,
    });
    await client.send(command);
  }

  /**
   * Get user details
   */
  async getUser(username: string) {
    const command = new AdminGetUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });
    return client.send(command);
  }

  /**
   * Map role to Cognito group
   */
  getRoleGroup(role: string): string {
    const groupMap: Record<string, string> = {
      PLATFORM_ADMIN: 'platform-admins',
      CLIENT_ADMIN: 'client-admins',
      TEAM_MEMBER: 'team-members',
    };
    return groupMap[role] || 'team-members';
  }
}

export const cognitoService = new CognitoService();
```

### Register Auth Plugin

Update `apps/api/src/index.ts`:

```typescript
import { authPlugin } from './plugins/auth';

// ... after other plugins
await fastify.register(authPlugin);
```

---

## Frontend Implementation

### Install Dependencies

```bash
cd apps/web
pnpm add aws-amplify @aws-amplify/ui-react
```

### Auth Provider

`apps/web/src/lib/auth/auth-provider.tsx`:

```typescript
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import { 
  signIn as amplifySignIn, 
  signOut as amplifySignOut, 
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
} from 'aws-amplify/auth';

// Configure Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
    },
  },
});

export interface AuthUser {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
  firstName?: string;
  lastName?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const attributes = await fetchUserAttributes();

      const accessToken = session.tokens?.accessToken;
      
      setUser({
        sub: currentUser.userId,
        email: attributes.email || '',
        role: accessToken?.payload['custom:role'] as string || 'TEAM_MEMBER',
        tenantId: accessToken?.payload['custom:tenant_id'] as string,
        firstName: attributes.given_name,
        lastName: attributes.family_name,
      });
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    try {
      await amplifySignIn({ username: email, password });
      await checkAuth();
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }

  async function signUp(email: string, password: string, firstName: string, lastName: string) {
    try {
      await amplifySignUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            given_name: firstName,
            family_name: lastName,
          },
        },
      });
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  }

  async function confirmSignUp(email: string, code: string) {
    try {
      await amplifyConfirmSignUp({ username: email, confirmationCode: code });
    } catch (error) {
      console.error('Confirm sign up error:', error);
      throw error;
    }
  }

  async function signOut() {
    try {
      await amplifySignOut();
      setUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  async function getAccessToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.accessToken?.toString() || null;
    } catch {
      return null;
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signUp,
        confirmSignUp,
        signOut,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

### Update API Client

`apps/web/src/lib/api.ts`:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let getTokenFn: (() => Promise<string | null>) | null = null;

export function setAuthTokenFn(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

export async function api<T>(
  endpoint: string,
  options: RequestInit & { params?: Record<string, any> } = {}
): Promise<T> {
  const { params, ...init } = options;

  // Build URL with query params
  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  // Get auth token
  const token = getTokenFn ? await getTokenFn() : null;

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `API Error: ${response.status}`);
  }

  return response.json();
}

export const apiClient = {
  get: <T>(endpoint: string, params?: Record<string, any>) =>
    api<T>(endpoint, { method: 'GET', params }),
  post: <T>(endpoint: string, body?: unknown) =>
    api<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(endpoint: string, body: unknown) =>
    api<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: unknown) =>
    api<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) =>
    api<T>(endpoint, { method: 'DELETE' }),
};
```

### Auth-Aware Layout

`apps/web/src/app/layout.tsx`:

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/lib/query-client';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { AuthInitializer } from '@/components/auth/auth-initializer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'KOL360',
  description: 'KOL Survey Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <AuthInitializer />
          <QueryProvider>{children}</QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
```

`apps/web/src/components/auth/auth-initializer.tsx`:

```typescript
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
```

### Login Page

`apps/web/src/app/login/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await signIn(email, password);
      router.push('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>Enter your credentials to access KOL360</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Protected Route HOC

`apps/web/src/components/auth/require-auth.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, AuthUser } from '@/lib/auth/auth-provider';

interface RequireAuthProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function RequireAuth({ children, allowedRoles }: RequireAuthProps) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && allowedRoles && user) {
      if (!allowedRoles.includes(user.role)) {
        router.push('/unauthorized');
      }
    }
  }, [isLoading, isAuthenticated, allowedRoles, user, router]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
```

---

## Environment Variables

Add to `apps/api/.env`:
```env
COGNITO_USER_POOL_ID=us-east-1_xxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxx
COGNITO_REGION=us-east-1
```

Add to `apps/web/.env.local`:
```env
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxx
```

---

## Acceptance Criteria

- [ ] Cognito User Pool created with correct configuration
- [ ] Users can sign up (account disabled by default)
- [ ] Email verification works
- [ ] JWT tokens validated on protected API routes
- [ ] Public routes (health, survey taking) accessible without auth
- [ ] Role-based access control enforced
- [ ] Frontend login/logout works
- [ ] Protected pages redirect to login when unauthenticated
- [ ] API client automatically includes auth token

---

## Next Module
→ `1A-client-management.md` - Client CRUD operations
