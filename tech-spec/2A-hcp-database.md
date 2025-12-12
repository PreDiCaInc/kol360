# Module 2A: HCP Database Module

## Objective
Build HCP management with CRUD, bulk import from Excel, alias management, and search.

## Prerequisites
- Module 1B completed

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/hcps` | List/search HCPs with pagination |
| GET | `/api/v1/hcps/:id` | Get HCP with scores and aliases |
| POST | `/api/v1/hcps` | Create single HCP |
| PUT | `/api/v1/hcps/:id` | Update HCP |
| POST | `/api/v1/hcps/import` | Bulk import from Excel |
| GET | `/api/v1/hcps/:id/aliases` | Get HCP aliases |
| POST | `/api/v1/hcps/:id/aliases` | Add alias |
| DELETE | `/api/v1/hcps/:id/aliases/:aliasId` | Remove alias |
| POST | `/api/v1/hcps/aliases/import` | Bulk import aliases |

---

## Backend Implementation

### Install Excel Library

```bash
cd apps/api
pnpm add xlsx
```

### HCP Service

`apps/api/src/services/hcp.service.ts`:

```typescript
import { prisma } from '../lib/prisma';
import * as XLSX from 'xlsx';
import { CreateHcpInput, UpdateHcpInput } from '@kol360/shared';

interface SearchParams {
  query?: string;
  specialty?: string;
  state?: string;
  diseaseAreaId?: string;
  page: number;
  limit: number;
}

export class HcpService {
  async search(params: SearchParams) {
    const { query, specialty, state, diseaseAreaId, page, limit } = params;
    
    const where: any = {};

    if (query) {
      where.OR = [
        { npi: { contains: query } },
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { aliases: { some: { aliasName: { contains: query, mode: 'insensitive' } } } },
      ];
    }
    if (specialty) where.specialty = specialty;
    if (state) where.state = state;

    const [total, items] = await Promise.all([
      prisma.hcp.count({ where }),
      prisma.hcp.findMany({
        where,
        include: {
          aliases: true,
          _count: { select: { campaignHcps: true, nominationsReceived: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);

    return {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string) {
    return prisma.hcp.findUnique({
      where: { id },
      include: {
        aliases: true,
        diseaseAreaScores: {
          where: { isCurrent: true },
          include: { diseaseArea: true },
        },
        campaignScores: {
          include: { campaign: { include: { diseaseArea: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        campaignHcps: {
          include: { campaign: { select: { id: true, name: true, status: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  async getByNpi(npi: string) {
    return prisma.hcp.findUnique({ where: { npi } });
  }

  async create(data: CreateHcpInput, createdBy?: string) {
    return prisma.hcp.create({
      data: { ...data, createdBy },
    });
  }

  async update(id: string, data: UpdateHcpInput) {
    return prisma.hcp.update({ where: { id }, data });
  }

  async importFromExcel(buffer: Buffer, userId: string) {
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    const result = { total: rows.length, created: 0, updated: 0, errors: [] as any[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Normalize NPI
        const npi = String(row.NPI || row.npi || '').trim();
        if (!/^\d{10}$/.test(npi)) {
          throw new Error('Invalid NPI format');
        }

        const data = {
          npi,
          firstName: String(row['First Name'] || row.firstName || '').trim(),
          lastName: String(row['Last Name'] || row.lastName || '').trim(),
          email: row.Email || row.email || null,
          specialty: row.Specialty || row.specialty || null,
          subSpecialty: row['Sub-specialty'] || row.subSpecialty || null,
          city: row.City || row.city || null,
          state: row.State || row.state || null,
          yearsInPractice: row['Years in Practice'] ? parseInt(row['Years in Practice']) : null,
        };

        if (!data.firstName || !data.lastName) {
          throw new Error('First and last name required');
        }

        const existing = await prisma.hcp.findUnique({ where: { npi } });
        
        if (existing) {
          await prisma.hcp.update({
            where: { npi },
            data: {
              firstName: data.firstName || existing.firstName,
              lastName: data.lastName || existing.lastName,
              email: data.email || existing.email,
              specialty: data.specialty || existing.specialty,
              subSpecialty: data.subSpecialty || existing.subSpecialty,
              city: data.city || existing.city,
              state: data.state || existing.state,
              yearsInPractice: data.yearsInPractice ?? existing.yearsInPractice,
            },
          });
          result.updated++;
        } else {
          await prisma.hcp.create({ data: { ...data, createdBy: userId } });
          result.created++;
        }
      } catch (error: any) {
        result.errors.push({ row: i + 2, error: error.message });
      }
    }

    return result;
  }

  // Alias management
  async addAlias(hcpId: string, aliasName: string, createdBy: string) {
    return prisma.hcpAlias.create({
      data: { hcpId, aliasName, createdBy },
    });
  }

  async removeAlias(aliasId: string) {
    return prisma.hcpAlias.delete({ where: { id: aliasId } });
  }

  async importAliases(buffer: Buffer, userId: string) {
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    const result = { total: rows.length, created: 0, skipped: 0, errors: [] as any[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const npi = String(row.NPI || row.npi || '').trim();
        const alias = String(row.Alias || row.alias || '').trim();

        const hcp = await prisma.hcp.findUnique({ where: { npi } });
        if (!hcp) throw new Error(`HCP not found: ${npi}`);

        const existing = await prisma.hcpAlias.findFirst({
          where: { hcpId: hcp.id, aliasName: alias },
        });

        if (existing) {
          result.skipped++;
        } else {
          await prisma.hcpAlias.create({
            data: { hcpId: hcp.id, aliasName: alias, createdBy: userId },
          });
          result.created++;
        }
      } catch (error: any) {
        result.errors.push({ row: i + 2, error: error.message });
      }
    }

    return result;
  }

  // Find HCP by name (for nomination matching)
  async findByName(name: string) {
    const normalizedName = name.toLowerCase().trim();
    
    // Search in canonical names and aliases
    const matches = await prisma.hcp.findMany({
      where: {
        OR: [
          { firstName: { contains: normalizedName, mode: 'insensitive' } },
          { lastName: { contains: normalizedName, mode: 'insensitive' } },
          { aliases: { some: { aliasName: { contains: normalizedName, mode: 'insensitive' } } } },
        ],
      },
      include: { aliases: true },
      take: 10,
    });

    return matches;
  }
}
```

### Routes

`apps/api/src/routes/hcps.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHcpSchema, updateHcpSchema, paginationSchema } from '@kol360/shared';
import { requireClientAdmin } from '../middleware/rbac';
import { HcpService } from '../services/hcp.service';
import multipart from '@fastify/multipart';

const hcpService = new HcpService();

export const hcpRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart);
  fastify.addHook('preHandler', requireClientAdmin());

  // Search HCPs
  fastify.get('/', async (request) => {
    const { query, specialty, state, page, limit } = request.query as any;
    return hcpService.search({
      query,
      specialty,
      state,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });
  });

  // Get HCP by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const hcp = await hcpService.getById(request.params.id);
    if (!hcp) return reply.status(404).send({ error: 'Not Found' });
    return hcp;
  });

  // Create HCP
  fastify.post('/', async (request, reply) => {
    const data = createHcpSchema.parse(request.body);
    
    // Check for duplicate NPI
    const existing = await hcpService.getByNpi(data.npi);
    if (existing) {
      return reply.status(409).send({ error: 'Conflict', message: 'NPI already exists' });
    }

    const hcp = await hcpService.create(data, request.user!.sub);
    return reply.status(201).send(hcp);
  });

  // Update HCP
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = updateHcpSchema.parse(request.body);
    const hcp = await hcpService.update(request.params.id, data);
    return hcp;
  });

  // Bulk import HCPs
  fastify.post('/import', async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded' });

    const buffer = await file.toBuffer();
    const result = await hcpService.importFromExcel(buffer, request.user!.sub);
    return result;
  });

  // Get aliases
  fastify.get<{ Params: { id: string } }>('/:id/aliases', async (request) => {
    const hcp = await hcpService.getById(request.params.id);
    return hcp?.aliases || [];
  });

  // Add alias
  fastify.post<{ Params: { id: string } }>('/:id/aliases', async (request, reply) => {
    const { aliasName } = request.body as { aliasName: string };
    const alias = await hcpService.addAlias(request.params.id, aliasName, request.user!.sub);
    return reply.status(201).send(alias);
  });

  // Remove alias
  fastify.delete<{ Params: { id: string; aliasId: string } }>(
    '/:id/aliases/:aliasId',
    async (request, reply) => {
      await hcpService.removeAlias(request.params.aliasId);
      return reply.status(204).send();
    }
  );

  // Bulk import aliases
  fastify.post('/aliases/import', async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded' });

    const buffer = await file.toBuffer();
    const result = await hcpService.importAliases(buffer, request.user!.sub);
    return result;
  });
};
```

---

## Frontend Implementation

### HCP List Page

`apps/web/src/app/admin/hcps/page.tsx`:

Key features:
- Search by NPI, name, alias
- Filter by specialty, state
- Pagination
- Import button with file upload
- Click row to view details

### HCP Import Dialog

`apps/web/src/components/hcps/hcp-import-dialog.tsx`:

Key features:
- Download template link
- Drag & drop file upload
- Preview imported rows
- Show results (created, updated, errors)

### HCP Detail Page

`apps/web/src/app/admin/hcps/[id]/page.tsx`:

Key features:
- Profile information
- Alias management (add/remove)
- Disease area scores (read-only)
- Campaign history

---

## Excel Templates

### HCP Import Template

| NPI | First Name | Last Name | Email | Specialty | Sub-specialty | City | State | Years in Practice |
|-----|------------|-----------|-------|-----------|---------------|------|-------|-------------------|
| 1234567890 | John | Smith | john@hospital.com | Ophthalmology | Retina | Boston | MA | 15 |

### Alias Import Template

| NPI | Alias |
|-----|-------|
| 1234567890 | Johnny Smith |
| 1234567890 | J. Smith |

---

## Acceptance Criteria

- [ ] Search HCPs by NPI, name, or alias
- [ ] Filter by specialty and state
- [ ] Create single HCP with validation
- [ ] Bulk import from Excel (creates or updates)
- [ ] Import shows results and errors
- [ ] Add/remove aliases for HCP
- [ ] Bulk import aliases
- [ ] View HCP scores by disease area
- [ ] View HCP campaign history

---

## Next Module
→ `3A-question-bank.md` - Question bank management
