import { prisma } from '../lib/prisma';

interface ListParams {
  status?: string;
  page: number;
  limit: number;
}

interface HcpSuggestion {
  hcp: {
    id: string;
    npi: string;
    firstName: string;
    lastName: string;
    specialty: string | null;
    city: string | null;
    state: string | null;
    aliases: Array<{ id: string; aliasName: string }>;
  };
  score: number;
}

interface CreateHcpInput {
  npi: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  specialty?: string | null;
  city?: string | null;
  state?: string | null;
}

interface HcpWithAliases {
  id: string;
  npi: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
  city: string | null;
  state: string | null;
  aliases: Array<{ id: string; aliasName: string }>;
}

interface HcpAlias {
  id: string;
  aliasName: string;
}

export class NominationService {
  async listForCampaign(campaignId: string, params: ListParams) {
    const { status, page, limit } = params;

    const where: Record<string, unknown> = {
      response: { campaignId },
    };
    if (status) where.matchStatus = status;

    const [total, items] = await Promise.all([
      prisma.nomination.count({ where }),
      prisma.nomination.findMany({
        where,
        include: {
          matchedHcp: { select: { id: true, npi: true, firstName: true, lastName: true } },
          question: { include: { question: true } },
          nominatorHcp: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ matchStatus: 'asc' }, { rawNameEntered: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getSuggestions(nominationId: string): Promise<HcpSuggestion[]> {
    const nomination = await prisma.nomination.findUnique({
      where: { id: nominationId },
    });

    if (!nomination) return [];

    // Parse name parts
    const nameParts = nomination.rawNameEntered
      .toLowerCase()
      .replace(/[^a-z\s]/g, '') // Remove non-letter characters
      .split(/\s+/)
      .filter(Boolean);

    if (nameParts.length === 0) return [];

    // Search HCPs by name parts and aliases
    const suggestions = await prisma.hcp.findMany({
      where: {
        OR: [
          // Match first name or last name containing any part
          ...nameParts.flatMap((part: string) => [
            { firstName: { contains: part, mode: 'insensitive' as const } },
            { lastName: { contains: part, mode: 'insensitive' as const } },
          ]),
          // Match aliases
          {
            aliases: {
              some: {
                aliasName: { contains: nomination.rawNameEntered, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      include: { aliases: true },
      take: 15,
    });

    // Score and sort by relevance
    const scored = suggestions.map((hcp: HcpWithAliases) => {
      const fullName = `${hcp.firstName} ${hcp.lastName}`.toLowerCase();
      const rawName = nomination.rawNameEntered.toLowerCase().trim();

      let score = 0;

      // Exact full name match
      if (fullName === rawName) {
        score = 100;
      }
      // Exact alias match
      else if (hcp.aliases.some((a: HcpAlias) => a.aliasName.toLowerCase() === rawName)) {
        score = 95;
      }
      // Full name contains raw name or vice versa
      else if (fullName.includes(rawName) || rawName.includes(fullName)) {
        score = 85;
      }
      // Last name exact match
      else if (hcp.lastName.toLowerCase() === rawName.split(' ').pop()) {
        score = 75;
      }
      // Partial alias match
      else if (
        hcp.aliases.some((a: HcpAlias) =>
          a.aliasName.toLowerCase().includes(rawName) ||
          rawName.includes(a.aliasName.toLowerCase())
        )
      ) {
        score = 70;
      }
      // Multiple name parts match
      else {
        const matchCount = nameParts.filter(
          (part: string) =>
            hcp.firstName.toLowerCase().includes(part) ||
            hcp.lastName.toLowerCase().includes(part)
        ).length;
        score = Math.min(60, matchCount * 25);
      }

      return {
        hcp: {
          id: hcp.id,
          npi: hcp.npi,
          firstName: hcp.firstName,
          lastName: hcp.lastName,
          specialty: hcp.specialty,
          city: hcp.city,
          state: hcp.state,
          aliases: hcp.aliases.map((a: HcpAlias) => ({ id: a.id, aliasName: a.aliasName })),
        },
        score,
      };
    });

    // Sort by score descending and take top 10
    return scored.sort((a: HcpSuggestion, b: HcpSuggestion) => b.score - a.score).slice(0, 10);
  }

  async matchToHcp(
    nominationId: string,
    hcpId: string,
    addAlias: boolean,
    matchedBy: string
  ) {
    const nomination = await prisma.nomination.findUnique({
      where: { id: nominationId },
    });

    if (!nomination) {
      throw new Error('Nomination not found');
    }

    // Optionally add raw name as alias
    if (addAlias) {
      await prisma.hcpAlias.upsert({
        where: {
          hcpId_aliasName: { hcpId, aliasName: nomination.rawNameEntered },
        },
        create: {
          hcpId,
          aliasName: nomination.rawNameEntered,
          createdBy: matchedBy,
        },
        update: {},
      });
    }

    // Update nomination
    const updated = await prisma.nomination.update({
      where: { id: nominationId },
      data: {
        matchedHcpId: hcpId,
        matchStatus: 'MATCHED',
        matchedBy,
        matchedAt: new Date(),
      },
      include: {
        matchedHcp: { select: { id: true, npi: true, firstName: true, lastName: true } },
      },
    });

    return updated;
  }

  async createHcpAndMatch(
    nominationId: string,
    hcpData: CreateHcpInput,
    matchedBy: string
  ) {
    const nomination = await prisma.nomination.findUnique({
      where: { id: nominationId },
    });

    if (!nomination) {
      throw new Error('Nomination not found');
    }

    // Check if NPI already exists
    const existingHcp = await prisma.hcp.findUnique({
      where: { npi: hcpData.npi },
    });

    if (existingHcp) {
      throw new Error('An HCP with this NPI already exists');
    }

    // Create new HCP
    const hcp = await prisma.hcp.create({
      data: {
        ...hcpData,
        createdBy: matchedBy,
      },
    });

    // Add raw name as alias
    await prisma.hcpAlias.create({
      data: {
        hcpId: hcp.id,
        aliasName: nomination.rawNameEntered,
        createdBy: matchedBy,
      },
    });

    // Update nomination
    const updated = await prisma.nomination.update({
      where: { id: nominationId },
      data: {
        matchedHcpId: hcp.id,
        matchStatus: 'NEW_HCP',
        matchedBy,
        matchedAt: new Date(),
      },
      include: {
        matchedHcp: { select: { id: true, npi: true, firstName: true, lastName: true } },
      },
    });

    return updated;
  }

  async exclude(nominationId: string, matchedBy: string) {
    return prisma.nomination.update({
      where: { id: nominationId },
      data: {
        matchStatus: 'EXCLUDED',
        matchedBy,
        matchedAt: new Date(),
      },
    });
  }

  async getStats(campaignId: string) {
    const stats = await prisma.nomination.groupBy({
      by: ['matchStatus'],
      where: { response: { campaignId } },
      _count: true,
    });

    return stats.reduce(
      (acc: Record<string, number>, s: { matchStatus: string; _count: number }) => {
        acc[s.matchStatus] = s._count;
        return acc;
      },
      {}
    );
  }

  async bulkAutoMatch(campaignId: string, matchedBy: string) {
    // Get all unmatched nominations for this campaign
    const unmatched = await prisma.nomination.findMany({
      where: {
        response: { campaignId },
        matchStatus: 'UNMATCHED',
      },
    });

    let matched = 0;
    const errors: string[] = [];

    for (const nomination of unmatched) {
      try {
        // Get suggestions
        const suggestions = await this.getSuggestions(nomination.id);

        // Auto-match if there's a high-confidence match (score >= 95)
        const bestMatch = suggestions[0];
        if (bestMatch && bestMatch.score >= 95) {
          await this.matchToHcp(nomination.id, bestMatch.hcp.id, true, matchedBy);
          matched++;
        }
      } catch (error) {
        errors.push(`Failed to auto-match "${nomination.rawNameEntered}"`);
      }
    }

    return { matched, total: unmatched.length, errors };
  }
}

export const nominationService = new NominationService();
