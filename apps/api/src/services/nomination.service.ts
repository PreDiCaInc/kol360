import { prisma } from '../lib/prisma';
import { HcpService } from './hcp.service';

const hcpServiceInstance = new HcpService();

// Normalize curly/smart apostrophes to straight so e.g. D'Aversa (curly)
// matches D'Aversa (straight) — common when users paste from Word/Outlook.
function normalizeApostrophes(s: string): string {
  return s.replace(/[‘’]/g, "'");
}

// Return both apostrophe forms when the input contains an apostrophe,
// for use in OR-style equality queries that need to span legacy data.
function apostropheForms(s: string): string[] {
  const straight = s.replace(/[‘’]/g, "'");
  const curly = s.replace(/'/g, '’');
  return straight === curly ? [s] : [straight, curly];
}

interface ListParams {
  status?: string;
  search?: string;
  searchMode?: 'contains' | 'exact'; // 'contains' (default) or 'exact' (case-insensitive equality)
  nominationType?: string;
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
    const { status, search, searchMode, nominationType, page, limit } = params;

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

    // Server-side search across rawNameEntered and matchedHcp name.
    // In 'exact' mode, support comma-separated terms — each is matched as a
    // case-insensitive equality, ORed together. e.g. "na, n/a" matches both literal forms.
    // In 'contains' mode, the full string is used (commas are part of the search).
    if (search && search.trim()) {
      const isExact = searchMode === 'exact';
      const orClauses: Array<Record<string, unknown>> = [];
      if (isExact) {
        const terms = search.split(',').map(t => t.trim()).filter(Boolean);
        for (const term of terms) {
          const filter = { equals: term, mode: 'insensitive' as const };
          orClauses.push({ rawNameEntered: filter });
          orClauses.push({ matchedHcp: { firstName: filter } });
          orClauses.push({ matchedHcp: { lastName: filter } });
        }
      } else {
        const q = search.trim();
        const filter = { contains: q, mode: 'insensitive' as const };
        orClauses.push({ rawNameEntered: filter });
        orClauses.push({ matchedHcp: { firstName: filter } });
        orClauses.push({ matchedHcp: { lastName: filter } });
      }
      if (orClauses.length > 0) {
        where.OR = orClauses;
      }
    }

    // Server-side nomination type filter
    if (nominationType) {
      where.question = {
        question: { nominationType },
      };
    }

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
      include: {
        response: {
          include: {
            respondentHcp: { select: { state: true, specialty: true } },
          },
        },
      },
    });

    if (!nomination) return [];

    // Context from the nominator — used as a tiebreaker boost. The HCP doing
    // the nominating is statistically more likely to know peers in their own
    // state and specialty, so candidates that share these get a small bump.
    const nominatorState = nomination.response?.respondentHcp?.state ?? null;
    const nominatorSpecialty = nomination.response?.respondentHcp?.specialty ?? null;

    // Normalize name: strip titles, credentials, suffixes, and smart apostrophes
    const normalizedName = normalizeApostrophes(nomination.rawNameEntered)
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
          // Alias exact match (try normalized + original + both apostrophe forms,
          // so D'Aversa (curly) and D'Aversa (straight) cross-match).
          ...Array.from(new Set([
            ...apostropheForms(rawNameTrimmed),
            ...apostropheForms(nomination.rawNameEntered.trim()),
          ])).map(form => ({
            aliases: {
              some: {
                aliasName: { equals: form, mode: 'insensitive' as const },
              },
            },
          })),
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

    // Tier 2.5: Trigram fuzzy match on last name. Catches typos that exact
    // and contains queries miss — e.g. "Donnenfield" → "Donnenfeld". Backed
    // by pg_trgm extension + gin_trgm_ops index on Hcp.lastName.
    const lastNamePart = nameParts[nameParts.length - 1];
    const trigramRows = lastNamePart && nameParts.length >= 1
      ? await prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
          SELECT id, similarity("lastName", ${lastNamePart})::float AS similarity
          FROM "Hcp"
          WHERE similarity("lastName", ${lastNamePart}) >= 0.6
          ORDER BY similarity DESC
          LIMIT 20
        `
      : [];
    const trigramSimByHcpId = new Map<string, number>(
      trigramRows.map(r => [r.id, Number(r.similarity)])
    );
    const trigramMatches = trigramRows.length > 0
      ? await prisma.hcp.findMany({
          where: { id: { in: trigramRows.map(r => r.id) } },
          include: { aliases: true },
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

    // Deduplicate across tiers, ordered exact > last-name-exact > trigram > partial
    const seenIds = new Set<string>();
    const suggestions: HcpWithAliases[] = [];
    for (const hcp of [...exactMatches, ...lastNameMatches, ...trigramMatches, ...partialMatches]) {
      if (!seenIds.has(hcp.id)) {
        seenIds.add(hcp.id);
        suggestions.push(hcp);
      }
    }

    // Score and sort by relevance - prioritize actual name matches over alias matches.
    // All comparisons normalize curly→straight apostrophes so smart-quote variations match.
    const scored = suggestions.map((hcp: HcpWithAliases) => {
      const fullName = normalizeApostrophes(`${hcp.firstName} ${hcp.lastName}`).toLowerCase();
      const reverseName = normalizeApostrophes(`${hcp.lastName} ${hcp.firstName}`).toLowerCase();
      const rawName = normalizeApostrophes(normalizedName).toLowerCase().trim();
      const aliasesNormalized = hcp.aliases.map((a: HcpAlias) => normalizeApostrophes(a.aliasName).toLowerCase());

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
      else if (aliasesNormalized.some((a: string) => a === rawName)) {
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
        normalizeApostrophes(hcp.lastName).toLowerCase() === rawName.split(' ').pop() &&
        nameParts.some((part: string) => normalizeApostrophes(hcp.firstName).toLowerCase().includes(part))
      ) {
        score = 85;
        matchType = 'primary';
        isNameMatch = true;
      }
      // PRIORITY 5: Partial alias match - needs review
      else if (
        aliasesNormalized.some((a: string) => a.includes(rawName) || rawName.includes(a))
      ) {
        score = 70;
        matchType = 'alias';
        isNameMatch = false;
      }
      // PRIORITY 6: Multiple name parts match on actual name - needs review
      else {
        const matchCount = nameParts.filter(
          (part: string) =>
            normalizeApostrophes(hcp.firstName).toLowerCase().includes(part) ||
            normalizeApostrophes(hcp.lastName).toLowerCase().includes(part)
        ).length;
        score = Math.min(60, matchCount * 25);
        matchType = 'partial';
        // Only consider it a name match if score is high enough (50%+)
        // Low-confidence partial matches should offer to add alias
        isNameMatch = score >= 50;
      }

      // Trigram fuzzy boost: when last name is similar (typo case) and the
      // base score landed below the primary-name tier, promote toward the
      // primary band so the right HCP doesn't get stuck in partial soup.
      const trigramSim = trigramSimByHcpId.get(hcp.id);
      if (trigramSim !== undefined && trigramSim >= 0.6) {
        const trigramScore = Math.round(trigramSim * 100); // 60..100
        if (trigramScore > score) {
          score = trigramScore;
          // High similarity is essentially a name match; lower is a hint
          matchType = trigramSim >= 0.75 ? 'primary' : 'partial';
          isNameMatch = trigramSim >= 0.75;
        }
      }

      // Tiebreaker: small boost when the candidate shares state and/or specialty
      // with the nominator. Helps surface the right person among same-name HCPs.
      if (nominatorState && hcp.state && nominatorState === hcp.state) score += 5;
      if (nominatorSpecialty && hcp.specialty && nominatorSpecialty === hcp.specialty) score += 5;

      // Cap at 100. The boost is a tiebreaker for ordering — it must not
      // produce >100 confidence (nonsensical) or break the `confidence === 100`
      // gate that promotes exact matches straight to MATCHED instead of REVIEW_NEEDED.
      score = Math.min(100, score);

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
    matchConfidence?: number,
    isManual: boolean = false
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
      // Normalize curly apostrophes so all new aliases are stored in a single form,
      // and future equality lookups don't miss them.
      const normalizedAlias = normalizeApostrophes(nomination.rawNameEntered.trim());

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

    // Determine match status:
    // - Manual picks (human selected from suggestion dialog) → MATCHED regardless of confidence
    // - Auto matches at 100% on primary/alias → MATCHED
    // - Everything else → REVIEW_NEEDED
    const confidence = matchConfidence ?? 100;
    const isExactMatch = confidence === 100 && (matchType === 'exact' || matchType === 'primary' || matchType === 'alias');
    const matchStatus = (isManual || isExactMatch) ? 'MATCHED' : 'REVIEW_NEEDED';

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

  /**
   * Exclude multiple nominations at once.
   * Returns the count of nominations actually updated.
   */
  async bulkExclude(nominationIds: string[], matchedBy: string, reason?: string) {
    if (nominationIds.length === 0) return { count: 0 };
    const result = await prisma.nomination.updateMany({
      where: { id: { in: nominationIds } },
      data: {
        matchStatus: 'EXCLUDED',
        matchedBy,
        matchedAt: new Date(),
        excludeReason: reason || null,
      },
    });
    return { count: result.count };
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

    // Reprocess UNMATCHED *and* REVIEW_NEEDED. Newly-added HCPs after the
    // initial auto-match pass are the most common reason a REVIEW_NEEDED row
    // would now have a better candidate available.
    // Leave MATCHED and EXCLUDED alone — those are confirmed decisions.
    const candidates = await prisma.nomination.findMany({
      where: {
        response: { campaignId },
        matchStatus: { in: ['UNMATCHED', 'REVIEW_NEEDED'] },
      },
    });

    let matched = 0;
    let upgraded = 0;
    const errors: string[] = [];

    for (const nomination of candidates) {
      try {
        const suggestions = await this.getSuggestions(nomination.id);
        const bestMatch = suggestions[0];
        if (!bestMatch || bestMatch.score < 50) continue;

        // For REVIEW_NEEDED rows, only act if the new best is genuinely an
        // improvement — different HCP, higher score, OR the new best is an
        // exact 100% match that would now promote to MATCHED status.
        // The last clause heals rows stuck at >100% confidence from the brief
        // v1.15.14 window where boosts could push score past 100.
        if (nomination.matchStatus === 'REVIEW_NEEDED') {
          const sameHcp = nomination.matchedHcpId === bestMatch.hcp.id;
          const currentScore = nomination.matchConfidence ?? 0;
          const wouldBeMatched =
            bestMatch.score === 100 &&
            (bestMatch.matchType === 'exact' ||
              bestMatch.matchType === 'primary' ||
              bestMatch.matchType === 'alias');
          const noImprovement = sameHcp && bestMatch.score <= currentScore && !wouldBeMatched;
          if (noImprovement) continue;
          upgraded++;
        } else {
          matched++;
        }

        const shouldAddAlias = !bestMatch.isNameMatch;
        await this.matchToHcp(
          nomination.id,
          bestMatch.hcp.id,
          shouldAddAlias,
          matchedBy,
          bestMatch.matchType,
          bestMatch.score
        );
      } catch (error) {
        errors.push(`Failed to auto-match "${nomination.rawNameEntered}"`);
      }
    }

    return { matched, upgraded, total: candidates.length, errors };
  }
}

export const nominationService = new NominationService();
