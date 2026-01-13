import { prisma } from '../lib/prisma';
import ExcelJS from 'exceljs';
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
    const { query, specialty, state, page, limit } = params;

    const where: Record<string, unknown> = {};

    if (query) {
      where.OR = [
        { npi: { contains: query } },
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
              scoreOrgAwareness: true,
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
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);
    const sheet = workbook.worksheets[0];

    // Convert worksheet to array of objects with headers
    const rows: Record<string, unknown>[] = [];
    const headers: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // First row is headers
        row.eachCell((cell) => {
          headers.push(String(cell.value || ''));
        });
      } else {
        // Data rows
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

    const result = { total: rows.length, created: 0, updated: 0, errors: [] as { row: number; error: string }[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Normalize NPI
        const npi = String(row['NPI'] || row['npi'] || '').trim();
        if (!/^\d{10}$/.test(npi)) {
          throw new Error('Invalid NPI format');
        }

        const data = {
          npi,
          firstName: String(row['First Name'] || row['firstName'] || '').trim(),
          lastName: String(row['Last Name'] || row['lastName'] || '').trim(),
          email: (row['Email'] || row['email'] || null) as string | null,
          specialty: (row['Specialty'] || row['specialty'] || null) as string | null,
          subSpecialty: (row['Sub-specialty'] || row['subSpecialty'] || null) as string | null,
          city: (row['City'] || row['city'] || null) as string | null,
          state: (row['State'] || row['state'] || null) as string | null,
          yearsInPractice: row['Years in Practice'] ? parseInt(String(row['Years in Practice'])) : null,
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
      } catch (error) {
        result.errors.push({ row: i + 2, error: error instanceof Error ? error.message : 'Unknown error' });
      }
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

  async importAliases(buffer: Buffer, userId: string) {
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);
    const sheet = workbook.worksheets[0];

    // Convert worksheet to array of objects with headers
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

  // Import segment scores from Excel
  async importSegmentScores(buffer: Buffer, diseaseAreaId?: string) {
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);
    const sheet = workbook.worksheets[0];

    // Convert worksheet to array of objects with headers
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

    const result = { total: rows.length, created: 0, updated: 0, errors: [] as { row: number; error: string }[] };

    // Map column names to score fields
    const scoreFieldMap: Record<string, string> = {
      'Research & Publications': 'scorePublications',
      'Clinical Trials': 'scoreClinicalTrials',
      'Trade Pubs': 'scoreTradePubs',
      'Org Leadership': 'scoreOrgLeadership',
      'Org Awareness': 'scoreOrgAwareness',
      'Conference': 'scoreConference',
      'Social Media': 'scoreSocialMedia',
      'Media/Podcasts': 'scoreMediaPodcasts',
    };

    // Get default disease area if not provided
    let targetDiseaseAreaId = diseaseAreaId;
    if (!targetDiseaseAreaId) {
      const defaultDA = await prisma.diseaseArea.findFirst({ where: { isActive: true } });
      if (!defaultDA) {
        result.errors.push({ row: 0, error: 'No active disease area found' });
        return result;
      }
      targetDiseaseAreaId = defaultDA.id;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const npi = String(row['NPI'] || row['npi'] || '').trim();
        if (!/^\d{10}$/.test(npi)) {
          throw new Error('Invalid NPI format');
        }

        const hcp = await prisma.hcp.findUnique({ where: { npi } });
        if (!hcp) {
          throw new Error(`HCP not found: ${npi}`);
        }

        // Build score data
        const scoreData: Record<string, number | null> = {};
        for (const [colName, fieldName] of Object.entries(scoreFieldMap)) {
          const value = row[colName];
          if (value !== undefined && value !== null && value !== '') {
            const numValue = parseFloat(String(value));
            if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
              scoreData[fieldName] = numValue;
            }
          }
        }

        // Check if existing score record exists for this HCP and disease area
        const existing = await prisma.hcpDiseaseAreaScore.findFirst({
          where: { hcpId: hcp.id, diseaseAreaId: targetDiseaseAreaId, isCurrent: true },
        });

        if (existing) {
          // Update existing score
          await prisma.hcpDiseaseAreaScore.update({
            where: { id: existing.id },
            data: {
              ...scoreData,
              lastCalculatedAt: new Date(),
            },
          });
          result.updated++;
        } else {
          // Create new score
          await prisma.hcpDiseaseAreaScore.create({
            data: {
              hcpId: hcp.id,
              diseaseAreaId: targetDiseaseAreaId,
              ...scoreData,
              isCurrent: true,
              effectiveFrom: new Date(),
            },
          });
          result.created++;
        }
      } catch (error) {
        result.errors.push({ row: i + 2, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    return result;
  }
}
