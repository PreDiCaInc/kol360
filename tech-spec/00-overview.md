# KOL360 Technical Specification - Overview

## For Claude Code Development

This directory contains modular tech specs for building the KOL360 platform. Each file is a self-contained prompt for Claude Code.

**Reference Document:** `func_spec-KOL_Platform_FINAL.md`

---

## Build Sequence

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BUILD SEQUENCE                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  FOUNDATION (Week 1)                                                │
│  ├── 0A: Project Scaffolding (Monorepo setup)                      │
│  ├── 0B: Database Schema (Prisma)                                  │
│  └── 0C: Authentication (Cognito integration)                      │
│                                                                     │
│  CORE PLATFORM (Week 2)                                             │
│  ├── 1A: Admin Module - Client Management                          │
│  ├── 1B: Admin Module - User Management                            │
│  └── 2A: HCP Database Module                                       │
│                                                                     │
│  SURVEY CONFIGURATION (Week 3)                                      │
│  ├── 3A: Question Bank Module                                      │
│  ├── 3B: Survey Builder (Templates)                                │
│  └── 4A: Composite Score Configuration                             │
│                                                                     │
│  CAMPAIGN EXECUTION (Week 4-5)                                      │
│  ├── 5A: Campaign Management                                       │
│  ├── 5B: Survey Distribution (Tokens, Emails)                      │
│  └── 6A: Survey Taking Experience (Public)                         │
│                                                                     │
│  DATA PROCESSING (Week 6)                                           │
│  ├── 7A: Response Collection & Review                              │
│  ├── 7B: Nomination Matching                                       │
│  └── 8A: Score Calculation & Publishing                            │
│                                                                     │
│  CLIENT DELIVERY (Week 7)                                           │
│  ├── 9A: Client Portal - Results View                              │
│  └── 9B: Export & Payment Processing                               │
│                                                                     │
│  PHASE 2 (Future)                                                   │
│  ├── 10A: Analytics Dashboards                                     │
│  └── 10B: Lite Client Support                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Backend** | Fastify 5.x | REST API, schema validation |
| **Runtime** | Node.js 22 LTS | Latest features |
| **Language** | TypeScript 5.x | Shared types |
| **Frontend** | Next.js 15 (App Router) | SSR, React Server Components |
| **Database** | PostgreSQL 16 | Aurora Serverless v2 in prod |
| **ORM** | Prisma | Type-safe queries |
| **Auth** | AWS Cognito | JWT, user pools |
| **Validation** | Zod | Shared frontend/backend |
| **UI** | Tailwind + Shadcn/ui | Accessible components |
| **State** | TanStack Query | Server state caching |
| **Forms** | React Hook Form + Zod | Validation |
| **Email** | AWS SES | Transactional emails |
| **Storage** | AWS S3 | File uploads |
| **Hosting** | AWS App Runner + Amplify | Backend + Frontend |

---

## Project Structure

```
kol360/
├── apps/
│   ├── api/                    # Fastify backend
│   │   ├── src/
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── services/       # Business logic
│   │   │   ├── plugins/        # Fastify plugins
│   │   │   └── lib/            # Utilities
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── package.json
│   │
│   └── web/                    # Next.js frontend
│       ├── src/
│       │   ├── app/            # App Router pages
│       │   ├── components/     # React components
│       │   ├── lib/            # API client, utilities
│       │   └── hooks/          # Custom hooks
│       └── package.json
│
├── packages/
│   └── shared/                 # Shared code
│       ├── src/
│       │   ├── types/          # TypeScript interfaces
│       │   ├── schemas/        # Zod schemas
│       │   └── constants/      # Enums, constants
│       └── package.json
│
├── docker-compose.yml          # Local PostgreSQL
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## Module Files

| File | Module | Dependencies |
|------|--------|--------------|
| `0A-project-scaffolding.md` | Monorepo setup | None |
| `0B-database-schema.md` | Prisma schema | 0A |
| `0C-authentication.md` | Cognito integration | 0A, 0B |
| `1A-client-management.md` | Client CRUD | 0C |
| `1B-user-management.md` | User CRUD + approval | 0C |
| `2A-hcp-database.md` | HCP + aliases + import | 1A |
| `3A-question-bank.md` | Questions + sections | 2A |
| `3B-survey-builder.md` | Templates | 3A |
| `4A-composite-score-config.md` | Weight configuration | 3B |
| `5A-campaign-management.md` | Campaign CRUD | 4A |
| `5B-survey-distribution.md` | Tokens + emails | 5A |
| `6A-survey-taking.md` | Public survey UI | 5B |
| `7A-response-collection.md` | Response review | 6A |
| `7B-nomination-matching.md` | Name matching UI | 7A |
| `8A-score-calculation.md` | Score calc + publish | 7B |
| `9A-client-portal.md` | Results view | 8A |
| `9B-exports-payments.md` | Excel exports + payments | 9A |

---

## Quick Start for Claude Code

1. Start with `0A-project-scaffolding.md` to set up the monorepo
2. Feed each module file sequentially as prompts
3. Each file contains:
   - Objective
   - API endpoints (backend)
   - Zod schemas (shared)
   - Service code (backend)
   - React components (frontend)
   - Acceptance criteria

---

## Environment Variables

```env
# Backend (apps/api/.env)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kol360
COGNITO_USER_POOL_ID=us-east-1_xxxxx
COGNITO_CLIENT_ID=xxxxxxxxx
COGNITO_REGION=us-east-1
AWS_REGION=us-east-1
SES_FROM_EMAIL=noreply@bio-exec.com
S3_BUCKET=kol360-uploads

# Frontend (apps/web/.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxx
```

---

## Conventions

### API Routes
- Base path: `/api/v1/`
- RESTful: `GET /clients`, `POST /clients`, `GET /clients/:id`
- Auth header: `Authorization: Bearer <jwt>`

### Code Style
- Use async/await everywhere
- Service layer for business logic
- Zod for all validation
- PascalCase for types, camelCase for variables
- Explicit return types on functions

### Error Handling
```typescript
// Standard error response
{
  "error": "Not found",
  "message": "Client with ID xyz not found",
  "statusCode": 404
}
```

### Pagination
```typescript
// Standard pagination response
{
  "items": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```
