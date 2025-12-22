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
  matchType: 'exact' | 'primary' | 'alias' | 'partial';
  isNameMatch: boolean; // true if matched on actual name (not alias)
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

    // Score and sort by relevance - prioritize actual name matches over alias matches
    const scored = suggestions.map((hcp: HcpWithAliases) => {
      const fullName = `${hcp.firstName} ${hcp.lastName}`.toLowerCase();
      const reverseName = `${hcp.lastName} ${hcp.firstName}`.toLowerCase();
      const rawName = nomination.rawNameEntered.toLowerCase().trim();

      let score = 0;
      let matchType: 'exact' | 'primary' | 'alias' | 'partial' = 'partial';
      let isNameMatch = false;

      // PRIORITY 1: Exact full name match (highest priority) - 100%
      if (fullName === rawName || reverseName === rawName) {
        score = 100;
        matchType = 'exact';
        isNameMatch = true;
      }
      // PRIORITY 2: Exact alias match - 100% (same as exact name match)
      else if (hcp.aliases.some((a: HcpAlias) => a.aliasName.toLowerCase() === rawName)) {
        score = 100;
        matchType = 'alias';
        isNameMatch = false;
      }
      // PRIORITY 3: Full name contains raw name or vice versa (primary name match) - needs review
      else if (fullName.includes(rawName) || rawName.includes(fullName)) {
        score = 90;
        matchType = 'primary';
        isNameMatch = true;
      }
      // PRIORITY 4: Last name exact match with first name partial - needs review
      else if (
        hcp.lastName.toLowerCase() === rawName.split(' ').pop() &&
        nameParts.some((part: string) => hcp.firstName.toLowerCase().includes(part))
      ) {
        score = 85;
        matchType = 'primary';
        isNameMatch = true;
      }
      // PRIORITY 5: Partial alias match - needs review
      else if (
        hcp.aliases.some((a: HcpAlias) =>
          a.aliasName.toLowerCase().includes(rawName) ||
          rawName.includes(a.aliasName.toLowerCase())
        )
      ) {
        score = 70;
        matchType = 'alias';
        isNameMatch = false;
      }
      // PRIORITY 6: Multiple name parts match on actual name - needs review
      else {
        const matchCount = nameParts.filter(
          (part: string) =>
            hcp.firstName.toLowerCase().includes(part) ||
            hcp.lastName.toLowerCase().includes(part)
        ).length;
        score = Math.min(60, matchCount * 25);
        matchType = 'partial';
        // Only consider it a name match if score is high enough (50%+)
        // Low-confidence partial matches should offer to add alias
        isNameMatch = score >= 50;
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
        matchType,
        isNameMatch,
      };
    });

    // Sort by score descending and take top 10
    return scored.sort((a: HcpSuggestion, b: HcpSuggestion) => b.score - a.score).slice(0, 10);
  }

  async matchToHcp(
    nominationId: string,
    hcpId: string,
    addAlias: boolean,
    matchedBy: string,
    matchType?: 'exact' | 'primary' | 'alias' | 'partial',
    matchConfidence?: number
  ) {
    const nomination = await prisma.nomination.findUnique({
      where: { id: nominationId },
    });

    if (!nomination) {
      throw new Error('Nomination not found');
    }

    // Optionally add raw name as alias (case-insensitive check)
    if (addAlias) {
      const normalizedAlias = nomination.rawNameEntered.trim();

      // Check if alias already exists (case-insensitive)
      const existingAlias = await prisma.hcpAlias.findFirst({
        where: {
          hcpId,
          aliasName: { equals: normalizedAlias, mode: 'insensitive' },
        },
      });

      // Only add if no matching alias exists
      if (!existingAlias) {
        await prisma.hcpAlias.create({
          data: {
            hcpId,
            aliasName: normalizedAlias,
            createdBy: matchedBy,
          },
        });
      }
    }

    // Determine match status based on confidence
    // MATCHED = 100% exact match on primary name OR alias
    // REVIEW_NEEDED = anything less than 100% needs human verification
    const confidence = matchConfidence ?? 100;
    const isExactMatch = confidence === 100 && (matchType === 'exact' || matchType === 'primary' || matchType === 'alias');
    const matchStatus = isExactMatch ? 'MATCHED' : 'REVIEW_NEEDED';

    // Update nomination
    const updated = await prisma.nomination.update({
      where: { id: nominationId },
      data: {
        matchedHcpId: hcpId,
        matchStatus,
        matchType: matchType || 'exact',
        matchConfidence: confidence,
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

    // Add raw name as alias only if it differs from the HCP's actual name (case-insensitive)
    const hcpFullName = `${hcpData.firstName} ${hcpData.lastName}`.toLowerCase().trim();
    const rawNameLower = nomination.rawNameEntered.toLowerCase().trim();

    if (hcpFullName !== rawNameLower) {
      await prisma.hcpAlias.create({
        data: {
          hcpId: hcp.id,
          aliasName: nomination.rawNameEntered.trim(),
          createdBy: matchedBy,
        },
      });
    }

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

  async exclude(nominationId: string, matchedBy: string, reason?: string) {
    return prisma.nomination.update({
      where: { id: nominationId },
      data: {
        matchStatus: 'EXCLUDED',
        matchedBy,
        matchedAt: new Date(),
        excludeReason: reason || null,
      },
    });
  }

  async updateRawName(nominationId: string, newRawName: string) {
    const nomination = await prisma.nomination.findUnique({
      where: { id: nominationId },
    });

    if (!nomination) {
      throw new Error('Nomination not found');
    }

    if (nomination.matchStatus !== 'UNMATCHED' && nomination.matchStatus !== 'REVIEW_NEEDED') {
      throw new Error('Can only edit unmatched or review-needed nominations');
    }

    // Reset to UNMATCHED when editing so it can be matched again
    return prisma.nomination.update({
      where: { id: nominationId },
      data: {
        rawNameEntered: newRawName.trim(),
        matchStatus: 'UNMATCHED',
        matchedHcpId: null,
        matchType: null,
        matchConfidence: null,
        matchedBy: null,
        matchedAt: null,
      },
      include: {
        matchedHcp: { select: { id: true, npi: true, firstName: true, lastName: true } },
        question: { include: { question: true } },
        nominatorHcp: { select: { firstName: true, lastName: true } },
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

        const bestMatch = suggestions[0];
        if (bestMatch && bestMatch.score >= 50) {
          const shouldAddAlias = !bestMatch.isNameMatch; // Don't add alias if name already matches

          // Pass match type and confidence to determine status
          // Exact matches (100%) -> MATCHED
          // Alias matches (80%) -> MATCHED
          // Partial matches -> REVIEW_NEEDED
          await this.matchToHcp(
            nomination.id,
            bestMatch.hcp.id,
            shouldAddAlias,
            matchedBy,
            bestMatch.matchType,
            bestMatch.score
          );
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
