import { prisma } from '../lib/prisma';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { CreateHcpInput, UpdateHcpInput } from '@kol360/shared';

interface SearchParams {
  query?: string;
  specialty?: string;
  state?: string;
  diseaseAreaId?: string;
  hcpIds?: string[]; // Filter to specific HCP IDs (for tenant scoping)
  page: number;
  limit: number;
}

export class HcpService {
  /**
   * Generate a unique Business Entity ID (BE-XXXXXX format)
   * Uses a transaction to prevent race conditions that can cause duplicate IDs
   */
  async generateBeId(): Promise<string> {
    // Use a transaction with serializable isolation to prevent race conditions
    return prisma.$transaction(async (tx) => {
      const lastHcp = await tx.hcp.findFirst({
        where: { beId: { startsWith: 'BE-' } },
        orderBy: { beId: 'desc' },
        select: { beId: true },
      });

      let nextNum = 1;
      if (lastHcp?.beId) {
        const match = lastHcp.beId.match(/^BE-(\d+)$/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }

      const newBeId = 'BE-' + String(nextNum).padStart(6, '0');

      // Verify the ID doesn't exist (extra safety check)
      const existing = await tx.hcp.findFirst({
        where: { beId: newBeId },
        select: { id: true },
      });

      if (existing) {
        // If collision detected, find the actual max and increment
        const allBeIds = await tx.hcp.findMany({
          where: { beId: { startsWith: 'BE-' } },
          select: { beId: true },
          orderBy: { beId: 'desc' },
          take: 1,
        });
        if (allBeIds.length > 0 && allBeIds[0].beId) {
          const actualMatch = allBeIds[0].beId.match(/^BE-(\d+)$/);
          if (actualMatch) {
            nextNum = parseInt(actualMatch[1], 10) + 1;
            return 'BE-' + String(nextNum).padStart(6, '0');
          }
        }
        // Fallback: use timestamp-based ID
        return 'BE-' + Date.now().toString().slice(-6);
      }

      return newBeId;
    }, {
      isolationLevel: 'Serializable',
    });
  }

  async search(params: SearchParams) {
    const { query, specialty, state, hcpIds, page, limit } = params;

    const where: Record<string, unknown> = {};

    // Tenant scoping: filter to specific HCP IDs if provided
    if (hcpIds !== undefined) {
      where.id = { in: hcpIds };
    }

    if (query) {
      where.OR = [
        { npi: { contains: query } },
        { beId: { contains: query, mode: "insensitive" } },
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { aliases: { some: { aliasName: { contains: query, mode: 'insensitive' } } } },
      ];
    }
    // Support filtering by specialty (check both legacy field and new relation)
    if (specialty) {
      where.OR = [
        ...(where.OR as unknown[] || []),
        { specialty: specialty },
        { specialties: { some: { specialty: { name: specialty } } } },
      ];
    }
    if (state) where.state = state;

    const [total, items] = await Promise.all([
      prisma.hcp.count({ where }),
      prisma.hcp.findMany({
        where,
        include: {
          aliases: true,
          specialties: {
            include: { specialty: true },
            orderBy: { isPrimary: 'desc' },
          },
          diseaseAreaScores: {
            where: { isCurrent: true },
            select: {
              id: true,
              compositeScore: true,
              scorePublications: true,
              scoreClinicalTrials: true,
              scoreTradePubs: true,
              scoreOrgLeadership: true,
              scoreOrgAwards: true,
              scoreConference: true,
              scoreSocialMedia: true,
              scoreMediaPodcasts: true,
              scoreSurvey: true,
              totalNominationCount: true,
              diseaseArea: { select: { id: true, name: true, code: true } },
            },
          },
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
        specialties: {
          include: { specialty: true },
          orderBy: { isPrimary: 'desc' },
        },
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
        optOuts: {
          where: { resubscribedAt: null }, // Only show active opt-outs
          include: { campaign: { select: { id: true, name: true } } },
          orderBy: { optedOutAt: 'desc' },
        },
      },
    });
  }

  async getByNpi(npi: string) {
    return prisma.hcp.findUnique({ where: { npi } });
  }

  async create(data: CreateHcpInput, createdBy?: string) {
    // Use atomic creation to prevent race conditions with beId generation
    return this.createWithAtomicBeId(data, createdBy);
  }

  /**
   * Atomically create an HCP with a generated beId
   * This prevents race conditions by generating the beId and creating the HCP
   * in a single serializable transaction
   */
  async createWithAtomicBeId(data: CreateHcpInput, createdBy?: string) {
    return prisma.$transaction(async (tx) => {
      // Find the highest existing beId
      const lastHcp = await tx.hcp.findFirst({
        where: { beId: { startsWith: 'BE-' } },
        orderBy: { beId: 'desc' },
        select: { beId: true },
      });

      let nextNum = 1;
      if (lastHcp?.beId) {
        const match = lastHcp.beId.match(/^BE-(\d+)$/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }

      const newBeId = 'BE-' + String(nextNum).padStart(6, '0');

      // Create the HCP within the same transaction
      // This ensures atomicity - no other transaction can grab the same beId
      return tx.hcp.create({
        data: { ...data, beId: newBeId, isSurveyTaker: true, createdBy },
      });
    }, {
      isolationLevel: 'Serializable',
    });
  }

  async update(id: string, data: UpdateHcpInput) {
    return prisma.hcp.update({ where: { id }, data });
  }

  async importFromFile(buffer: Buffer, userId: string, filename: string = 'file.xlsx', importId?: string) {
    const { importProgressStore } = await import('./import-progress.service');
    const rows = await this.parseFileToRows(buffer, filename);

    const result = {
      importId,
      total: rows.length,
      created: 0,
      updated: 0,
      merged: 0,
      errors: [] as { row: number; error: string }[],
    };

    if (importId) {
      importProgressStore.start(importId, 'hcp', rows.length);
    }

    try {
      // Phase 1: Parse and validate all rows upfront
      const validRows: Array<{
        rowIndex: number;
        npi: string;
        firstName: string;
        lastName: string;
        email: string;
        specialty: string;
        subSpecialty: string | null;
        city: string | null;
        state: string | null;
        fullName: string;
      }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // Extract NPI first for error reporting
        const rawNpi = String(row['NPI'] || row['npi'] || '').trim();
        try {
          if (!/^\d{10}$/.test(rawNpi)) {
            throw new Error('Invalid NPI format');
          }

          const firstName = String(row['First Name'] || row['firstName'] || '').trim();
          const lastName = String(row['Last Name'] || row['lastName'] || '').trim();
          const email = (row['Email'] || row['email'] || null) as string | null;
          const specialty = (row['Specialty'] || row['specialty'] || null) as string | null;

          if (!firstName || !lastName) {
            throw new Error('First and last name required');
          }
          if (!email) {
            throw new Error('Email is required');
          }
          if (!specialty) {
            throw new Error('Specialty is required');
          }

          validRows.push({
            rowIndex: i,
            npi: rawNpi,
            firstName,
            lastName,
            email,
            specialty,
            subSpecialty: (row['Sub-specialty'] || row['subSpecialty'] || null) as string | null,
            city: (row['City'] || row['city'] || null) as string | null,
            state: (row['State'] || row['state'] || null) as string | null,
            fullName: `${firstName} ${lastName}`,
          });
        } catch (error) {
          const npiInfo = rawNpi ? ` (NPI: ${rawNpi})` : '';
          result.errors.push({ row: i + 2, error: `${error instanceof Error ? error.message : 'Unknown error'}${npiInfo}` });
        }
      }

      if (importId) {
        importProgressStore.update(importId, {
          processed: 0,
          created: 0,
          updated: 0,
          errors: result.errors.length,
          currentItem: 'Loading existing records...',
        });
      }

      // Phase 2: Bulk load existing data (2 queries instead of N*2)
      const allNpis = validRows.map(r => r.npi);
      const allFullNames = validRows.map(r => r.fullName.toLowerCase());

      const [existingHcps, existingAliases] = await Promise.all([
        prisma.hcp.findMany({
          where: { npi: { in: allNpis } },
          select: { id: true, npi: true, firstName: true, lastName: true, email: true, specialty: true, subSpecialty: true, city: true, state: true },
        }),
        prisma.hcpAlias.findMany({
          where: { aliasName: { in: allFullNames, mode: 'insensitive' } },
          include: { hcp: true },
        }),
      ]);

      const existingByNpi = new Map(existingHcps.map(h => [h.npi, h]));
      const aliasByName = new Map(existingAliases.map(a => [a.aliasName.toLowerCase(), a]));

      // Phase 3: Categorize records
      const toUpdate: Array<{ npi: string; data: Parameters<typeof prisma.hcp.update>[0]['data'] }> = [];
      const toMerge: Array<{ hcpId: string; data: Parameters<typeof prisma.hcp.update>[0]['data'] }> = [];
      const toCreate: typeof validRows = [];

      for (const row of validRows) {
        const existing = existingByNpi.get(row.npi);
        if (existing) {
          toUpdate.push({
            npi: row.npi,
            data: {
              firstName: row.firstName || existing.firstName,
              lastName: row.lastName || existing.lastName,
              email: row.email || existing.email,
              specialty: row.specialty || existing.specialty,
              subSpecialty: row.subSpecialty || existing.subSpecialty,
              city: row.city || existing.city,
              state: row.state || existing.state,
              isSurveyTaker: true,
            },
          });
        } else {
          const aliasMatch = aliasByName.get(row.fullName.toLowerCase());
          if (aliasMatch?.hcp) {
            toMerge.push({
              hcpId: aliasMatch.hcp.id,
              data: {
                npi: row.npi,
                firstName: row.firstName,
                lastName: row.lastName,
                email: row.email || aliasMatch.hcp.email,
                specialty: row.specialty || aliasMatch.hcp.specialty,
                subSpecialty: row.subSpecialty || aliasMatch.hcp.subSpecialty,
                city: row.city || aliasMatch.hcp.city,
                state: row.state || aliasMatch.hcp.state,
                isSurveyTaker: true,
              },
            });
          } else {
            toCreate.push(row);
          }
        }
      }

      // Phase 4: Execute batch updates in chunks
      const BATCH_SIZE = 100;

      // Batch updates
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + BATCH_SIZE);
        await prisma.$transaction(
          batch.map(item => prisma.hcp.update({ where: { npi: item.npi }, data: item.data }))
        );
        result.updated += batch.length;

        if (importId) {
          importProgressStore.update(importId, {
            processed: result.updated + result.merged + result.created,
            created: result.created,
            updated: result.updated + result.merged,
            errors: result.errors.length,
            currentItem: `Updated ${result.updated} records`,
          });
        }
      }

      // Batch merges
      for (let i = 0; i < toMerge.length; i += BATCH_SIZE) {
        const batch = toMerge.slice(i, i + BATCH_SIZE);
        await prisma.$transaction(
          batch.map(item => prisma.hcp.update({ where: { id: item.hcpId }, data: item.data }))
        );
        result.merged += batch.length;

        if (importId) {
          importProgressStore.update(importId, {
            processed: result.updated + result.merged + result.created,
            created: result.created,
            updated: result.updated + result.merged,
            errors: result.errors.length,
            currentItem: `Merged ${result.merged} records`,
          });
        }
      }

      // Batch creates - need to generate beIds first
      if (toCreate.length > 0) {
        // Get starting beId
        const lastHcp = await prisma.hcp.findFirst({
          where: { beId: { startsWith: 'BE-' } },
          orderBy: { beId: 'desc' },
          select: { beId: true },
        });
        let nextNum = 1;
        if (lastHcp?.beId) {
          const match = lastHcp.beId.match(/^BE-(\d+)$/);
          if (match) {
            nextNum = parseInt(match[1], 10) + 1;
          }
        }

        for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
          const batch = toCreate.slice(i, i + BATCH_SIZE);
          const createData = batch.map((row, idx) => ({
            beId: 'BE-' + String(nextNum + i + idx).padStart(6, '0'),
            npi: row.npi,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            specialty: row.specialty,
            subSpecialty: row.subSpecialty,
            city: row.city,
            state: row.state,
            isSurveyTaker: true,
            createdBy: userId,
          }));

          await prisma.hcp.createMany({ data: createData, skipDuplicates: true });
          result.created += batch.length;

          if (importId) {
            importProgressStore.update(importId, {
              processed: result.updated + result.merged + result.created,
              created: result.created,
              updated: result.updated + result.merged,
              errors: result.errors.length,
              currentItem: `Created ${result.created} records`,
            });
          }
        }
      }

      if (importId) {
        importProgressStore.complete(importId, {
          created: result.created,
          updated: result.updated + result.merged,
          errors: result.errors.length,
        });
      }
    } catch (error) {
      if (importId) {
        importProgressStore.fail(importId, error instanceof Error ? error.message : 'Unknown error');
      }
      throw error;
    }

    return result;
  }

  // Alias management
  async getAliases(hcpId: string) {
    return prisma.hcpAlias.findMany({ where: { hcpId } });
  }

  async addAlias(hcpId: string, aliasName: string, createdBy: string) {
    const normalizedAlias = aliasName.trim();

    // Check if alias already exists (case-insensitive)
    const existingAlias = await prisma.hcpAlias.findFirst({
      where: {
        hcpId,
        aliasName: { equals: normalizedAlias, mode: 'insensitive' },
      },
    });

    if (existingAlias) {
      throw new Error('This alias already exists for this HCP');
    }

    return prisma.hcpAlias.create({
      data: { hcpId, aliasName: normalizedAlias, createdBy },
    });
  }

  async removeAlias(aliasId: string) {
    return prisma.hcpAlias.delete({ where: { id: aliasId } });
  }

  async importAliases(buffer: Buffer, userId: string, filename: string = 'file.xlsx') {
    const rows = await this.parseFileToRows(buffer, filename);

    const result = { total: rows.length, created: 0, skipped: 0, errors: [] as { row: number; error: string }[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const npi = String(row['NPI'] || row['npi'] || '').trim();
        const alias = String(row['Alias'] || row['alias'] || '').trim();

        if (!alias) {
          throw new Error('Alias is required');
        }

        const hcp = await prisma.hcp.findUnique({ where: { npi } });
        if (!hcp) throw new Error(`HCP not found: ${npi}`);

        // Check for existing alias (case-insensitive)
        const existing = await prisma.hcpAlias.findFirst({
          where: { hcpId: hcp.id, aliasName: { equals: alias, mode: 'insensitive' } },
        });

        if (existing) {
          result.skipped++;
        } else {
          await prisma.hcpAlias.create({
            data: { hcpId: hcp.id, aliasName: alias, createdBy: userId },
          });
          result.created++;
        }
      } catch (error) {
        result.errors.push({ row: i + 2, error: error instanceof Error ? error.message : 'Unknown error' });
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

  // Get unique specialties for filter dropdown
  async getSpecialties() {
    // Get from new Specialty model
    const specialties = await prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return specialties;
  }

  // Specialty management
  async addSpecialtyToHcp(hcpId: string, specialtyId: string, isPrimary: boolean = false) {
    // If setting as primary, unset any existing primary
    if (isPrimary) {
      await prisma.hcpSpecialty.updateMany({
        where: { hcpId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return prisma.hcpSpecialty.upsert({
      where: { hcpId_specialtyId: { hcpId, specialtyId } },
      create: { hcpId, specialtyId, isPrimary },
      update: { isPrimary },
      include: { specialty: true },
    });
  }

  async removeSpecialtyFromHcp(hcpId: string, specialtyId: string) {
    return prisma.hcpSpecialty.delete({
      where: { hcpId_specialtyId: { hcpId, specialtyId } },
    });
  }

  async setHcpSpecialties(hcpId: string, specialtyIds: string[], primarySpecialtyId?: string) {
    // Remove all existing specialties
    await prisma.hcpSpecialty.deleteMany({ where: { hcpId } });

    // Add new specialties
    if (specialtyIds.length > 0) {
      await prisma.hcpSpecialty.createMany({
        data: specialtyIds.map(specialtyId => ({
          hcpId,
          specialtyId,
          isPrimary: specialtyId === primarySpecialtyId,
        })),
      });
    }

    return prisma.hcpSpecialty.findMany({
      where: { hcpId },
      include: { specialty: true },
    });
  }

  // Get unique states for filter dropdown
  async getStates() {
    const results = await prisma.hcp.findMany({
      where: { state: { not: null } },
      select: { state: true },
      distinct: ['state'],
      orderBy: { state: 'asc' },
    });
    return results.map((r: { state: string | null }) => r.state).filter(Boolean);
  }

  // Import segment scores from Excel or CSV (BATCH OPTIMIZED)
  // diseaseAreaId is required - scores are always tied to a specific disease area
  async importSegmentScores(buffer: Buffer, diseaseAreaId: string, filename?: string, importId?: string) {
    const { importProgressStore } = await import('./import-progress.service');
    const rows = await this.parseFileToRows(buffer, filename || 'file.xlsx');

    const result = { importId, total: rows.length, created: 0, updated: 0, errors: [] as { row: number; error: string }[] };

    if (importId) {
      importProgressStore.start(importId, 'segment-scores', rows.length);
    }

    const scoreFieldMap: Record<string, string> = {
      'Research & Publications': 'scorePublications',
      'Clinical Trials': 'scoreClinicalTrials',
      'Trade Pubs': 'scoreTradePubs',
      'Org Leadership': 'scoreOrgLeadership',
      'Org Awards': 'scoreOrgAwards',
      'Conference': 'scoreConference',
      'Social Media': 'scoreSocialMedia',
      'Media/Podcasts': 'scoreMediaPodcasts',
      'scorePublications': 'scorePublications',
      'scoreClinicalTrials': 'scoreClinicalTrials',
      'scoreTradePubs': 'scoreTradePubs',
      'scoreOrgLeadership': 'scoreOrgLeadership',
      'scoreOrgAwards': 'scoreOrgAwards',
      'scoreConference': 'scoreConference',
      'scoreSocialMedia': 'scoreSocialMedia',
      'scoreMediaPodcasts': 'scoreMediaPodcasts',
    };

    try {
      // Phase 1: Parse and validate all rows
      const validRows: Array<{
        rowIndex: number;
        npi: string;
        scoreData: Record<string, number>;
      }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // Extract NPI first for error reporting
        const rawNpi = String(row['NPI'] || row['npi'] || '').trim();
        try {
          if (!/^\d{10}$/.test(rawNpi)) {
            throw new Error('Invalid NPI format');
          }

          const scoreData: Record<string, number> = {};
          for (const [colName, fieldName] of Object.entries(scoreFieldMap)) {
            const value = row[colName];
            if (value !== undefined && value !== null && value !== '') {
              const numValue = parseFloat(String(value));
              if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
                scoreData[fieldName] = numValue;
              }
            }
          }

          validRows.push({ rowIndex: i, npi: rawNpi, scoreData });
        } catch (error) {
          const npiInfo = rawNpi ? ` (NPI: ${rawNpi})` : '';
          result.errors.push({ row: i + 2, error: `${error instanceof Error ? error.message : 'Unknown error'}${npiInfo}` });
        }
      }

      if (importId) {
        importProgressStore.update(importId, {
          processed: 0,
          created: 0,
          updated: 0,
          errors: result.errors.length,
          currentItem: 'Loading existing records...',
        });
      }

      // Phase 2: Bulk load HCPs and existing scores (2 queries instead of N*2)
      const allNpis = validRows.map(r => r.npi);

      const hcps = await prisma.hcp.findMany({
        where: { npi: { in: allNpis } },
        select: { id: true, npi: true },
      });
      const hcpByNpi = new Map(hcps.map(h => [h.npi, h]));

      // Mark NPIs that don't have HCPs as errors
      for (const row of validRows) {
        if (!hcpByNpi.has(row.npi)) {
          result.errors.push({ row: row.rowIndex + 2, error: `HCP not found: ${row.npi}` });
        }
      }

      // Filter to only valid rows with matching HCPs
      const rowsWithHcps = validRows.filter(r => hcpByNpi.has(r.npi));
      const hcpIds = rowsWithHcps.map(r => hcpByNpi.get(r.npi)!.id);

      const existingScores = await prisma.hcpDiseaseAreaScore.findMany({
        where: { hcpId: { in: hcpIds }, diseaseAreaId, isCurrent: true },
        select: { id: true, hcpId: true },
      });
      const existingByHcpId = new Map(existingScores.map(s => [s.hcpId, s]));

      // Phase 3: Categorize into creates and updates
      const toCreate: Array<{
        hcpId: string;
        diseaseAreaId: string;
        isCurrent: boolean;
        effectiveFrom: Date;
        scorePublications?: number;
        scoreClinicalTrials?: number;
        scoreTradePubs?: number;
        scoreOrgLeadership?: number;
        scoreOrgAwards?: number;
        scoreConference?: number;
        scoreSocialMedia?: number;
        scoreMediaPodcasts?: number;
      }> = [];
      const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];

      const now = new Date();
      for (const row of rowsWithHcps) {
        const hcp = hcpByNpi.get(row.npi)!;
        const existing = existingByHcpId.get(hcp.id);

        if (existing) {
          toUpdate.push({
            id: existing.id,
            data: { ...row.scoreData, lastCalculatedAt: now },
          });
        } else {
          toCreate.push({
            hcpId: hcp.id,
            diseaseAreaId,
            isCurrent: true,
            effectiveFrom: now,
            ...row.scoreData,
          });
        }
      }

      // Phase 4: Execute batch operations
      const BATCH_SIZE = 100;

      // Batch creates
      if (toCreate.length > 0) {
        for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
          const batch = toCreate.slice(i, i + BATCH_SIZE);
          await prisma.hcpDiseaseAreaScore.createMany({ data: batch });
          result.created += batch.length;

          if (importId) {
            importProgressStore.update(importId, {
              processed: result.created + result.updated,
              created: result.created,
              updated: result.updated,
              errors: result.errors.length,
              currentItem: `Created ${result.created} scores`,
            });
          }
        }
      }

      // Batch updates (need to do individually but in transaction batches)
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + BATCH_SIZE);
        await prisma.$transaction(
          batch.map(item => prisma.hcpDiseaseAreaScore.update({
            where: { id: item.id },
            data: item.data,
          }))
        );
        result.updated += batch.length;

        if (importId) {
          importProgressStore.update(importId, {
            processed: result.created + result.updated,
            created: result.created,
            updated: result.updated,
            errors: result.errors.length,
            currentItem: `Updated ${result.updated} scores`,
          });
        }
      }

      if (importId) {
        importProgressStore.complete(importId, {
          created: result.created,
          updated: result.updated,
          errors: result.errors.length,
        });
      }
    } catch (error) {
      if (importId) {
        importProgressStore.fail(importId, error instanceof Error ? error.message : 'Unknown error');
      }
      throw error;
    }

    return result;
  }

  /**
   * Parse file buffer (Excel or CSV) to array of row objects
   */
  private async parseFileToRows(buffer: Buffer, filename: string): Promise<Record<string, unknown>[]> {
    const isExcel = filename.endsWith('.xlsx') || filename.endsWith('.xls');
    const isCsv = filename.endsWith('.csv');

    if (!isExcel && !isCsv) {
      throw new Error('Unsupported file format. Please use .xlsx, .xls, or .csv files.');
    }

    if (isCsv) {
      return this.parseCsvToRows(buffer);
    } else {
      return this.parseExcelToRows(buffer);
    }
  }

  private parseCsvToRows(buffer: Buffer): Record<string, unknown>[] {
    const content = buffer.toString('utf-8');
    const records = parseCsv(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
    return records as Record<string, unknown>[];
  }

  private async parseExcelToRows(buffer: Buffer): Promise<Record<string, unknown>[]> {
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);
    const sheet = workbook.worksheets[0];

    const rows: Record<string, unknown>[] = [];
    const headers: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell) => {
          headers.push(String(cell.value || ''));
        });
      } else {
        const rowData: Record<string, unknown> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });
        rows.push(rowData);
      }
    });

    return rows;
  }
}
