# Module 0A: Project Scaffolding

## Objective
Set up a pnpm monorepo with Fastify backend and Next.js frontend, shared TypeScript types, and development tooling.

---

## Tasks

### 1. Initialize Monorepo

```bash
mkdir kol360 && cd kol360
pnpm init
```

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Create `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

Root `package.json`:
```json
{
  "name": "kol360",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "db:migrate": "pnpm --filter @kol360/api prisma migrate dev",
    "db:generate": "pnpm --filter @kol360/api prisma generate",
    "db:seed": "pnpm --filter @kol360/api prisma db seed",
    "db:studio": "pnpm --filter @kol360/api prisma studio"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

---

### 2. Create Shared Package

```bash
mkdir -p packages/shared/src/{types,schemas,constants}
```

`packages/shared/package.json`:
```json
{
  "name": "@kol360/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

`packages/shared/src/index.ts`:
```typescript
// Types
export * from './types';

// Schemas
export * from './schemas';

// Constants
export * from './constants';
```

`packages/shared/src/constants/index.ts`:
```typescript
export const USER_ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  CLIENT_ADMIN: 'CLIENT_ADMIN',
  TEAM_MEMBER: 'TEAM_MEMBER',
} as const;

export const CLIENT_TYPES = {
  FULL: 'FULL',
  LITE: 'LITE',
} as const;

export const CAMPAIGN_STATUSES = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  PUBLISHED: 'PUBLISHED',
} as const;

export const SURVEY_RESPONSE_STATUSES = {
  PENDING: 'PENDING',
  OPENED: 'OPENED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export const NOMINATION_MATCH_STATUSES = {
  UNMATCHED: 'UNMATCHED',
  MATCHED: 'MATCHED',
  NEW_HCP: 'NEW_HCP',
  EXCLUDED: 'EXCLUDED',
} as const;

export const PAYMENT_STATUSES = {
  PENDING_EXPORT: 'PENDING_EXPORT',
  EXPORTED: 'EXPORTED',
  EMAIL_SENT: 'EMAIL_SENT',
  EMAIL_DELIVERED: 'EMAIL_DELIVERED',
  EMAIL_OPENED: 'EMAIL_OPENED',
  CLAIMED: 'CLAIMED',
  BOUNCED: 'BOUNCED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;

export const OPT_OUT_SCOPES = {
  CAMPAIGN: 'CAMPAIGN',
  GLOBAL: 'GLOBAL',
} as const;

export const QUESTION_TYPES = {
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  RATING: 'RATING',
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  MULTI_CHOICE: 'MULTI_CHOICE',
  DROPDOWN: 'DROPDOWN',
  MULTI_TEXT: 'MULTI_TEXT',
} as const;

export const DISEASE_AREAS = [
  { code: 'RETINA', name: 'Retina', therapeuticArea: 'Ophthalmology' },
  { code: 'DRY_EYE', name: 'Dry Eye', therapeuticArea: 'Ophthalmology' },
  { code: 'GLAUCOMA', name: 'Glaucoma', therapeuticArea: 'Ophthalmology' },
  { code: 'CORNEA', name: 'Cornea', therapeuticArea: 'Ophthalmology' },
] as const;
```

`packages/shared/src/types/index.ts`:
```typescript
export type UserRole = 'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'TEAM_MEMBER';
export type UserStatus = 'PENDING_VERIFICATION' | 'PENDING_APPROVAL' | 'ACTIVE' | 'DISABLED';
export type ClientType = 'FULL' | 'LITE';
export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'PUBLISHED';
export type SurveyResponseStatus = 'PENDING' | 'OPENED' | 'IN_PROGRESS' | 'COMPLETED';
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
```

`packages/shared/src/schemas/index.ts`:
```typescript
import { z } from 'zod';

// Base schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const idParamSchema = z.object({
  id: z.string().cuid(),
});

// Will add entity-specific schemas in subsequent modules
export * from './client';
export * from './user';
export * from './hcp';
```

Create placeholder schema files:
```typescript
// packages/shared/src/schemas/client.ts
import { z } from 'zod';

export const clientTypeSchema = z.enum(['FULL', 'LITE']);

export const createClientSchema = z.object({
  name: z.string().min(2).max(100),
  type: clientTypeSchema.default('FULL'),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0066CC'),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
```

```typescript
// packages/shared/src/schemas/user.ts
import { z } from 'zod';

export const userRoleSchema = z.enum(['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']);
export const userStatusSchema = z.enum(['PENDING_VERIFICATION', 'PENDING_APPROVAL', 'ACTIVE', 'DISABLED']);

export const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  role: userRoleSchema,
  clientId: z.string().cuid().optional().nullable(),
});

export const updateUserSchema = createUserSchema.partial();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
```

```typescript
// packages/shared/src/schemas/hcp.ts
import { z } from 'zod';

export const npiSchema = z.string().regex(/^\d{10}$/, 'NPI must be 10 digits');

export const createHcpSchema = z.object({
  npi: npiSchema,
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email().optional().nullable(),
  specialty: z.string().optional().nullable(),
  subSpecialty: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().length(2).optional().nullable(),
  yearsInPractice: z.number().int().positive().optional().nullable(),
});

export const updateHcpSchema = createHcpSchema.partial().omit({ npi: true });

export type CreateHcpInput = z.infer<typeof createHcpSchema>;
export type UpdateHcpInput = z.infer<typeof updateHcpSchema>;
```

---

### 3. Create Fastify Backend

```bash
mkdir -p apps/api/src/{routes,services,plugins,lib,middleware}
```

`apps/api/package.json`:
```json
{
  "name": "@kol360/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src/",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@kol360/shared": "workspace:*",
    "@prisma/client": "^5.14.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/helmet": "^11.0.0",
    "@fastify/rate-limit": "^9.0.0",
    "@fastify/swagger": "^8.14.0",
    "@fastify/swagger-ui": "^3.0.0",
    "aws-jwt-verify": "^4.0.0",
    "fastify": "^4.27.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "prisma": "^5.14.0",
    "tsx": "^4.10.0",
    "typescript": "^5.4.0"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

`apps/api/src/index.ts`:
```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { prismaPlugin } from './plugins/prisma';
import { healthRoutes } from './routes/health';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' 
      ? { target: 'pino-pretty' } 
      : undefined,
  },
});

async function main() {
  // Security plugins
  await fastify.register(helmet);
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Database
  await fastify.register(prismaPlugin);

  // Routes
  await fastify.register(healthRoutes, { prefix: '/health' });

  // API v1 routes will be added here
  // await fastify.register(clientRoutes, { prefix: '/api/v1/clients' });

  // Start server
  const port = parseInt(process.env.PORT || '3001', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await fastify.listen({ port, host });
    console.log(`🚀 Server running at http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
```

`apps/api/src/plugins/prisma.ts`:
```typescript
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin = fp(async (fastify) => {
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'info', 'warn', 'error'] 
      : ['error'],
  });

  await prisma.$connect();

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
```

`apps/api/src/routes/health.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Liveness check
  fastify.get('/live', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Readiness check
  fastify.get('/ready', async () => {
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', checks: { database: 'ok' } };
    } catch (error) {
      return { status: 'error', checks: { database: 'error' } };
    }
  });
};
```

`apps/api/src/lib/errors.ts`:
```typescript
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public error: string = 'Error'
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toJSON() {
    return {
      error: this.error,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(404, message, 'Not Found');
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, message, 'Validation Error');
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'Unauthorized');
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message, 'Forbidden');
  }
}
```

---

### 4. Create Next.js Frontend

```bash
cd apps
pnpm create next-app@latest web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd ..
```

Update `apps/web/package.json` to add dependencies:
```json
{
  "name": "@kol360/web",
  "dependencies": {
    "@kol360/shared": "workspace:*",
    "@tanstack/react-query": "^5.40.0",
    "aws-amplify": "^6.3.0",
    "react-hook-form": "^7.51.0",
    "@hookform/resolvers": "^3.4.0",
    "zod": "^3.23.0",
    "lucide-react": "^0.378.0"
  }
}
```

Install shadcn/ui:
```bash
cd apps/web
pnpm dlx shadcn-ui@latest init
# Choose: TypeScript, Default style, CSS variables, tailwind.config.ts
pnpm dlx shadcn-ui@latest add button card input label table dialog form select badge
cd ../..
```

`apps/web/src/lib/api.ts`:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export async function api<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, ...init } = options;

  // Build URL with query params
  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  // Get auth token (will be implemented in 0C)
  const token = typeof window !== 'undefined' 
    ? localStorage.getItem('accessToken') 
    : null;

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.status}`);
  }

  return response.json();
}

// Typed API methods
export const apiClient = {
  get: <T>(endpoint: string, params?: Record<string, any>) =>
    api<T>(endpoint, { method: 'GET', params }),

  post: <T>(endpoint: string, body: unknown) =>
    api<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),

  put: <T>(endpoint: string, body: unknown) =>
    api<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),

  delete: <T>(endpoint: string) =>
    api<T>(endpoint, { method: 'DELETE' }),
};
```

`apps/web/src/lib/query-client.tsx`:
```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

`apps/web/src/app/layout.tsx`:
```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/lib/query-client';

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
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
```

`apps/web/src/app/page.tsx`:
```typescript
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">KOL360</h1>
      <p className="mt-4 text-gray-600">Platform initializing...</p>
    </main>
  );
}
```

---

### 5. Docker Compose for Local Development

`docker-compose.yml`:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: kol360-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: kol360
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

---

### 6. Environment Files

`apps/api/.env`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kol360?schema=public"
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:3000
```

`apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## Acceptance Criteria

- [ ] `pnpm install` completes without errors
- [ ] `docker-compose up -d` starts PostgreSQL
- [ ] `pnpm dev` starts both API (3001) and web (3000)
- [ ] `GET http://localhost:3001/health/live` returns `{ "status": "ok" }`
- [ ] `GET http://localhost:3001/health/ready` returns database status
- [ ] Frontend loads at `http://localhost:3000`
- [ ] Shared package types are importable in both apps
- [ ] TypeScript compiles without errors in all packages

---

## Next Module
→ `0B-database-schema.md` - Prisma schema and migrations
