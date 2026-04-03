import { prisma } from '../lib/prisma';
import { HcpService } from './hcp.service';

const hcpServiceInstance = new HcpService();

interface ListParams {
  status?: string;
  page: number;
  limit: number;
}

interface HcpSuggestion {
  hcp: {
    id: string;
    npi: string | null;
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
  npi?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  specialty?: string | null;
  city?: string | null;
  state?: string | null;
}

interface HcpWithAliases {
  id: string;
  npi: string | null;
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

    // Check if campaign excludes internal (bio-exec) emails
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { excludeInternalEmails: true },
    });
    const excludeInternal = campaign?.excludeInternalEmails ?? false;

    const where: Record<string, unknown> = {
      response: {
        campaignId,
        ...(excludeInternal && {
          respondentHcp: { email: { not: { endsWith: '@bio-exec.com' } } },
        }),
      },
    };
    if (status) where.matchStatus = status;

    const [total, items] = await Promise.all([
      prisma.nomination.count({ where }),
      prisma.nomination.findMany({
        where,
        include: {
          matchedHcp: { select: { id: true, npi: true, firstName: true, lastName: true } },
          question: { include: { question: { select: { id: true, type: true, nominationType: true } } } },
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

    // Normalize name: strip titles, credentials, and suffixes before matching
    const normalizedName = nomination.rawNameEntered
      .replace(/\b(dr|prof|mr|mrs|ms)\.?\s*/gi, '') // Remove titles
      .replace(/,?\s*\b(md|do|od|phd|mph|mba|facs|faao|bs|ms|rn|np|pa|jr|sr|ii|iii|iv)\b\.?/gi, '') // Remove credentials/suffixes
      .replace(/[^a-zA-Z\s'-]/g, '') // Remove remaining non-name characters (keep hyphens and apostrophes)
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();

    // Parse name parts from normalized name
    const nameParts = normalizedName
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    if (nameParts.length === 0) return [];

    // Search HCPs using a tiered approach to ensure exact matches aren't missed
    const rawNameTrimmed = normalizedName;

    // Tier 1: Exact full name match or alias match (most specific)
    const exactMatches = await prisma.hcp.findMany({
      where: {
        OR: [
          // Exact first+last match (assumes "First Last" format)
          ...(nameParts.length >= 2
            ? [
                {
                  AND: [
                    { firstName: { equals: nameParts[0], mode: 'insensitive' as const } },
                    { lastName: { equals: nameParts.slice(1).join(' '), mode: 'insensitive' as const } },
                  ],
                },
                // Also try "Last, First" or reversed
                {
                  AND: [
                    { firstName: { equals: nameParts[nameParts.length - 1], mode: 'insensitive' as const } },
                    { lastName: { equals: nameParts.slice(0, -1).join(' '), mode: 'insensitive' as const } },
                  ],
                },
              ]
            : []),
          // Alias exact match (try both normalized and original raw name)
          {
            aliases: {
              some: {
                aliasName: { equals: rawNameTrimmed, mode: 'insensitive' },
              },
            },
          },
          ...(rawNameTrimmed !== nomination.rawNameEntered.trim() ? [{
            aliases: {
              some: {
                aliasName: { equals: nomination.rawNameEntered.trim(), mode: 'insensitive' as const },
              },
            },
          }] : []),
        ],
      },
      include: { aliases: true },
      take: 10,
    });

    // Tier 2: Last name exact match with partial first name (handles "Chris" for "Christopher")
    const lastNameMatches = nameParts.length >= 2
      ? await prisma.hcp.findMany({
          where: {
            AND: [
              { lastName: { equals: nameParts[nameParts.length - 1], mode: 'insensitive' as const } },
              { firstName: { startsWith: nameParts[0], mode: 'insensitive' as const } },
            ],
          },
          include: { aliases: true },
          take: 10,
        })
      : [];

    // Tier 3: Broader partial matches (contains on name parts) + alias contains
    const partialMatches = await prisma.hcp.findMany({
      where: {
        OR: [
          ...nameParts.flatMap((part: string) => [
            { firstName: { contains: part, mode: 'insensitive' as const } },
            { lastName: { contains: part, mode: 'insensitive' as const } },
          ]),
          {
            aliases: {
              some: {
                aliasName: { contains: rawNameTrimmed, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      include: { aliases: true },
      take: 50,
    });

    // Deduplicate across tiers (exact matches first, then last name, then partial)
    const seenIds = new Set<string>();
    const suggestions: HcpWithAliases[] = [];
    for (const hcp of [...exactMatches, ...lastNameMatches, ...partialMatches]) {
      if (!seenIds.has(hcp.id)) {
        seenIds.add(hcp.id);
        suggestions.push(hcp);
      }
    }

    // Score and sort by relevance - prioritize actual name matches over alias matches
    const scored = suggestions.map((hcp: HcpWithAliases) => {
      const fullName = `${hcp.firstName} ${hcp.lastName}`.toLowerCase();
      const reverseName = `${hcp.lastName} ${hcp.firstName}`.toLowerCase();
      const rawName = normalizedName.toLowerCase().trim();

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
      include: {
        response: { select: { campaignId: true } },
      },
    });

    if (!nomination) {
      throw new Error('Nomination not found');
    }

    // Optionally add raw name as alias (case-insensitive check)
    if (addAlias) {
      const normalizedAlias = nomination.rawNameEntered.trim();

      // Check if alias already exists on ANY HCP (case-insensitive)
      const existingAliasOnTarget = await prisma.hcpAlias.findFirst({
        where: {
          hcpId,
          aliasName: { equals: normalizedAlias, mode: 'insensitive' },
        },
      });

      // Only add if no matching alias exists on target HCP
      if (!existingAliasOnTarget) {
        // Check if this alias exists on a different HCP
        const existingAliasOnOtherHcp = await prisma.hcpAlias.findFirst({
          where: {
            aliasName: { equals: normalizedAlias, mode: 'insensitive' },
            hcpId: { not: hcpId },
          },
        });

        // If alias exists on another HCP, we need to clear nominations
        // that were matched to that HCP via this alias
        if (existingAliasOnOtherHcp) {
          // Clear other nominations in the same campaign that have the same raw name
          // and were matched to a different HCP (likely via this alias)
          await prisma.nomination.updateMany({
            where: {
              id: { not: nominationId },
              response: { campaignId: nomination.response.campaignId },
              rawNameEntered: { equals: normalizedAlias, mode: 'insensitive' },
              matchedHcpId: { not: hcpId }, // Matched to a different HCP
              matchStatus: { in: ['MATCHED', 'REVIEW_NEEDED'] },
            },
            data: {
              matchedHcpId: null,
              matchStatus: 'UNMATCHED',
              matchType: null,
              matchConfidence: null,
              matchedBy: null,
              matchedAt: null,
            },
          });
        }

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

    // Set isNominated on the matched HCP if not already
    await prisma.hcp.update({
      where: { id: hcpId },
      data: { isNominated: true },
    });

    // Update nomination
    const updated = await prisma.nomination.update({
      where: { id: nominationId },
      data: {
        matchedHcpId: hcpId,
        matchStatus,
        matchType: matchType || "exact",
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

    // Check if NPI already exists (only if NPI provided)
    if (hcpData.npi) {
      const existingHcp = await prisma.hcp.findUnique({
        where: { npi: hcpData.npi },
      });
      if (existingHcp) {
        throw new Error("An HCP with this NPI already exists");
      }
    }

    // Create new HCP with beId and isNominated flag
    const beId = await hcpServiceInstance.generateBeId();
    const hcp = await prisma.hcp.create({
      data: {
        ...hcpData,
        npi: hcpData.npi || null,
        beId,
        isNominated: true,
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

  /**
   * Clear nominations that have stale alias matches.
   * This handles the case where:
   * 1. A nomination was matched to HCP A via an alias
   * 2. The same alias was later added to HCP B (or removed from A)
   * 3. We need to reset those nominations so they can be re-matched correctly
   */
  async clearStaleAliasMatches(campaignId: string) {
    // Get all matched/review-needed nominations that were matched via alias
    const aliasMatchedNominations = await prisma.nomination.findMany({
      where: {
        response: { campaignId },
        matchStatus: { in: ['MATCHED', 'REVIEW_NEEDED'] },
        matchType: 'alias',
        matchedHcpId: { not: null },
      },
      include: {
        matchedHcp: {
          include: { aliases: true },
        },
      },
    });

    let cleared = 0;

    for (const nomination of aliasMatchedNominations) {
      const rawNameLower = nomination.rawNameEntered.toLowerCase().trim();
      const matchedHcp = nomination.matchedHcp;

      if (!matchedHcp) continue;

      // Check if the alias still exists on the matched HCP
      const aliasStillExists = matchedHcp.aliases.some(
        (a: { aliasName: string }) => a.aliasName.toLowerCase() === rawNameLower
      );

      // Also check if there's now a better match (exact alias on a different HCP)
      const betterAliasMatch = await prisma.hcpAlias.findFirst({
        where: {
          aliasName: { equals: rawNameLower, mode: 'insensitive' },
          hcpId: { not: matchedHcp.id },
        },
      });

      // If alias no longer exists on matched HCP, or there's a better match elsewhere
      if (!aliasStillExists || betterAliasMatch) {
        await prisma.nomination.update({
          where: { id: nomination.id },
          data: {
            matchedHcpId: null,
            matchStatus: 'UNMATCHED',
            matchType: null,
            matchConfidence: null,
            matchedBy: null,
            matchedAt: null,
          },
        });
        cleared++;
      }
    }

    return { cleared };
  }

  async bulkAutoMatch(campaignId: string, matchedBy: string) {
    // First, clear nominations that might have stale alias matches
    // This handles the case where:
    // 1. A nomination was matched to HCP A via an alias
    // 2. The same alias was later added to HCP B
    // 3. We want to re-match to the correct HCP B
    await this.clearStaleAliasMatches(campaignId);

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
