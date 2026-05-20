import { prisma } from '../lib/prisma';
import { createAuditLog } from '../lib/audit';
import { HcpService } from './hcp.service';

const hcpServiceInstance = new HcpService();

/**
 * Best-effort audit write for nomination changes. Resolves the Cognito sub to
 * a User.id via createAuditLog (system-user fallback). Never throws — an audit
 * failure must not break matching/exclusion.
 */
async function auditNomination(
  cognitoSub: string,
  action: 'nomination.matched' | 'nomination.excluded',
  entityId: string,
  oldValues: Record<string, unknown> | undefined,
  newValues: Record<string, unknown>
): Promise<void> {
  try {
    await createAuditLog(cognitoSub, {
      action,
      entityType: 'Nomination',
      entityId,
      oldValues: oldValues as never,
      newValues: newValues as never,
    });
  } catch {
    // swallow — audit is non-blocking
  }
}

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
  // Multi-select sub-specialty (HcpDiseaseArea join) — applied after Hcp create.
  diseaseAreaIds?: string[];
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
    let normalizedName = normalizeApostrophes(nomination.rawNameEntered)
      // Remove leading titles. MUST have closing \b + a required separator (\s+):
      // without it, the "Dr" inside "Drake" matched and "Dr Carol Drake"
      // silently became "Carol ake". The \b\.?\s+ ensures we only strip a
      // standalone title token followed by a dot/space, not a name prefix.
      .replace(/\b(dr|prof|mr|mrs|ms)\b\.?\s+/gi, '')
      .replace(/,?\s*\b(md|do|od|phd|mph|mba|facs|faao|bs|ms|rn|np|pa|jr|sr|ii|iii|iv)\b\.?/gi, '') // Remove credentials/suffixes
      .replace(/[^a-zA-Z\s'-]/g, '') // Remove remaining non-name characters (keep hyphens and apostrophes)
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();

    // Strip a trailing US state abbreviation annotation, e.g.
    // "Eric Donnenfeld NY" → "Eric Donnenfeld". Only when ≥3 tokens so that
    // ≥2 (first + last) remain — avoids mangling short names like "Jo Ma".
    const trailingStateMatch = normalizedName.match(
      /\s+(A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])$/i
    );
    if (trailingStateMatch) {
      const stripped = normalizedName.slice(0, trailingStateMatch.index).trim();
      if (stripped.split(/\s+/).filter(Boolean).length >= 2) {
        normalizedName = stripped;
      }
    }

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

    // Tier 2.5: Trigram fuzzy match on the FULL normalized name. Catches typos
    // that exact/contains miss — e.g. "Flanery"→"Flanary", "Donnenfield"→
    // "Donnenfeld". Matching the full "first last" string (not just the last
    // token) is far more robust: the usually-correct first name anchors the
    // comparison, so a single-char surname typo still scores ~0.65–0.75 while
    // unrelated names rarely clear the 0.45 floor. Backed by pg_trgm.
    const trigramRows = normalizedName.length > 0
      ? await prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
          SELECT id,
                 similarity(lower("firstName" || ' ' || "lastName"), ${normalizedName.toLowerCase()})::float AS similarity
          FROM "Hcp"
          WHERE similarity(lower("firstName" || ' ' || "lastName"), ${normalizedName.toLowerCase()}) >= 0.45
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

    // Tier 3: Broader partial matches (contains on name parts) + alias contains.
    // Skip very short tokens (≤2 chars: stray initials, leftover "ny", etc.) —
    // a `contains "j"` floods the pool with junk and pushes the real partial
    // match out of the take window. Fall back to all tokens only if every
    // token is short (degenerate input) so the clause is never empty.
    const tier3Tokens = nameParts.filter((p: string) => p.length > 2);
    const containsTokens = tier3Tokens.length > 0 ? tier3Tokens : nameParts;
    const partialMatches = await prisma.hcp.findMany({
      where: {
        OR: [
          ...containsTokens.flatMap((part: string) => [
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
      take: 100,
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

    // Score components (weighted composite, max 100):
    //   - Name match: 0..90  (the substance of the score)
    //   - Same state: +5
    //   - Same specialty as nominator: +5
    //
    // 100 = perfect name + same state + same specialty.
    //  90 = perfect name, no context signal (or no overlap).
    // 80–89 = primary name (substring / last+partial) with optional context.
    // <80 = needs review (partial, fuzzy, or weak signal).
    //
    // matchType is what drives the MATCHED-vs-REVIEW_NEEDED gate in matchToHcp,
    // not the absolute score: "exact" and "alias" (perfect) at >=90 promote.
    // All comparisons normalize curly→straight apostrophes.
    const scored = suggestions.map((hcp: HcpWithAliases) => {
      const fullName = normalizeApostrophes(`${hcp.firstName} ${hcp.lastName}`).toLowerCase();
      const reverseName = normalizeApostrophes(`${hcp.lastName} ${hcp.firstName}`).toLowerCase();
      const rawName = normalizeApostrophes(normalizedName).toLowerCase().trim();
      const aliasesNormalized = hcp.aliases.map((a: HcpAlias) => normalizeApostrophes(a.aliasName).toLowerCase());

      let nameScore = 0; // 0..90 — name component only
      let matchType: 'exact' | 'primary' | 'alias' | 'partial' = 'partial';
      let isNameMatch = false;

      // PRIORITY 1: Exact full name match (perfect)
      if (fullName === rawName || reverseName === rawName) {
        nameScore = 90;
        matchType = 'exact';
        isNameMatch = true;
      }
      // PRIORITY 2: Exact alias match (perfect — alias is equivalent for matching)
      else if (aliasesNormalized.some((a: string) => a === rawName)) {
        nameScore = 90;
        matchType = 'alias';
        isNameMatch = false;
      }
      // PRIORITY 3: Full name contains raw name or vice versa
      else if (fullName.includes(rawName) || rawName.includes(fullName)) {
        nameScore = 80;
        matchType = 'primary';
        isNameMatch = true;
      }
      // PRIORITY 4: Last name exact + first name partial (e.g. "Chris" ≈ "Christopher")
      else if (
        normalizeApostrophes(hcp.lastName).toLowerCase() === rawName.split(' ').pop() &&
        nameParts.some((part: string) => normalizeApostrophes(hcp.firstName).toLowerCase().includes(part))
      ) {
        nameScore = 75;
        matchType = 'primary';
        isNameMatch = true;
      }
      // PRIORITY 5: Partial alias (substring) — alias is hinting, not exact
      else if (
        aliasesNormalized.some((a: string) => a.includes(rawName) || rawName.includes(a))
      ) {
        nameScore = 60;
        matchType = 'alias';
        isNameMatch = false;
      }
      // PRIORITY 6: Multiple name parts match — partial only
      else {
        const matchCount = nameParts.filter(
          (part: string) =>
            normalizeApostrophes(hcp.firstName).toLowerCase().includes(part) ||
            normalizeApostrophes(hcp.lastName).toLowerCase().includes(part)
        ).length;
        nameScore = Math.min(45, matchCount * 20);
        matchType = 'partial';
        isNameMatch = nameScore >= 40;
      }

      // Trigram fuzzy override (typo case). Similarity is now on the full
      // "first last" string, so bands are tuned for that scale: a single-char
      // surname typo lands ~0.65–0.75. Trigram never sets matchType
      // exact/alias, so these never auto-MATCH — they surface for review.
      const trigramSim = trigramSimByHcpId.get(hcp.id);
      if (trigramSim !== undefined && trigramSim >= 0.45) {
        const trigramName = trigramSim >= 0.7 ? 80 : trigramSim >= 0.55 ? 70 : 55;
        if (trigramName > nameScore) {
          nameScore = trigramName;
          matchType = trigramSim >= 0.55 ? 'primary' : 'partial';
          isNameMatch = trigramSim >= 0.55;
        }
      }

      // Context within budget: +5 state, +5 specialty, sourced from nominator
      const stateBoost = (nominatorState && hcp.state && nominatorState === hcp.state) ? 5 : 0;
      const specialtyBoost = (nominatorSpecialty && hcp.specialty && nominatorSpecialty === hcp.specialty) ? 5 : 0;
      let score = nameScore + stateBoost + specialtyBoost;

      // Defensive cap. By construction nameScore<=90 and boosts<=10, so score<=100,
      // but keep this in case any band is ever bumped without retuning.
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

    // Determine match status. Score budget (v1.15.16):
    //   name=90 + state=5 + specialty=5 = 100. A perfect name match alone is 90,
    //   so the gate uses matchType (the name component) rather than a strict 100.
    // - Manual picks (human selected from suggestion dialog) → MATCHED regardless
    // - Auto perfect-name matches (matchType in {exact, alias} at >=90) → MATCHED
    // - Everything else → REVIEW_NEEDED
    const confidence = matchConfidence ?? 100;
    const isPerfectNameMatch =
      confidence >= 90 && (matchType === 'exact' || matchType === 'alias');
    const matchStatus = (isManual || isPerfectNameMatch) ? 'MATCHED' : 'REVIEW_NEEDED';

    // Set isNominated on the matched HCP if not already
    await prisma.hcp.update({
      where: { id: hcpId },
      data: { isNominated: true },
    });

    // Snapshot prior state for the audit trail (before/after)
    const oldValues = {
      matchedHcpId: nomination.matchedHcpId,
      matchStatus: nomination.matchStatus,
      matchType: nomination.matchType,
      matchConfidence: nomination.matchConfidence,
    };

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

    await auditNomination(matchedBy, 'nomination.matched', nominationId, oldValues, {
      matchedHcpId: hcpId,
      matchStatus,
      matchType: matchType || 'exact',
      matchConfidence: confidence,
      rawNameEntered: nomination.rawNameEntered,
      source: isManual ? 'manual' : 'auto',
      aliasAdded: addAlias,
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

    // Create new HCP with beId and isNominated flag. diseaseAreaIds is the
    // multi-select sub-specialty (HcpDiseaseArea join) — strip from the Hcp
    // create payload and reconcile via setHcpDiseaseAreas after creation.
    const beId = await hcpServiceInstance.generateBeId();
    const { diseaseAreaIds, ...hcpCreateData } = hcpData;
    const hcp = await prisma.hcp.create({
      data: {
        ...hcpCreateData,
        npi: hcpData.npi || null,
        beId,
        isNominated: true,
        createdBy: matchedBy,
      },
    });
    if (diseaseAreaIds && diseaseAreaIds.length > 0) {
      await hcpServiceInstance.setHcpDiseaseAreas(hcp.id, diseaseAreaIds);
    }

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

    const oldValues = {
      matchedHcpId: nomination.matchedHcpId,
      matchStatus: nomination.matchStatus,
    };

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

    await auditNomination(matchedBy, 'nomination.matched', nominationId, oldValues, {
      matchedHcpId: hcp.id,
      matchStatus: 'NEW_HCP',
      rawNameEntered: nomination.rawNameEntered,
      source: 'manual',
      createdNewHcp: { id: hcp.id, beId: hcp.beId, npi: hcp.npi, name: `${hcp.firstName} ${hcp.lastName}` },
    });

    return updated;
  }

  async exclude(nominationId: string, matchedBy: string, reason?: string) {
    const prior = await prisma.nomination.findUnique({
      where: { id: nominationId },
      select: { matchStatus: true, matchedHcpId: true, rawNameEntered: true },
    });

    const updated = await prisma.nomination.update({
      where: { id: nominationId },
      data: {
        matchStatus: 'EXCLUDED',
        matchedBy,
        matchedAt: new Date(),
        excludeReason: reason || null,
      },
    });

    await auditNomination(
      matchedBy,
      'nomination.excluded',
      nominationId,
      prior ? { matchStatus: prior.matchStatus, matchedHcpId: prior.matchedHcpId } : undefined,
      {
        matchStatus: 'EXCLUDED',
        excludeReason: reason || null,
        rawNameEntered: prior?.rawNameEntered,
        source: 'manual',
      }
    );

    return updated;
  }

  /**
   * Exclude multiple nominations at once.
   * Returns the count of nominations actually updated.
   */
  async bulkExclude(nominationIds: string[], matchedBy: string, reason?: string) {
    if (nominationIds.length === 0) return { count: 0 };

    // Snapshot prior statuses for the audit summary (lightweight projection)
    const prior = await prisma.nomination.findMany({
      where: { id: { in: nominationIds } },
      select: { id: true, matchStatus: true, matchedHcpId: true },
    });

    const result = await prisma.nomination.updateMany({
      where: { id: { in: nominationIds } },
      data: {
        matchStatus: 'EXCLUDED',
        matchedBy,
        matchedAt: new Date(),
        excludeReason: reason || null,
      },
    });

    // One summary audit row for the bulk action (per-row breadcrumbs are on
    // each Nomination via matchedBy/matchedAt/excludeReason). entityId is the
    // first id; the full set + prior states live in the values payload.
    await auditNomination(
      matchedBy,
      'nomination.excluded',
      nominationIds[0],
      { count: prior.length, items: prior },
      {
        bulk: true,
        excludedCount: result.count,
        excludeReason: reason || null,
        nominationIds,
        source: 'manual',
      }
    );

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
  async clearStaleAliasMatches(campaignId: string, actor: string = 'system') {
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
        await auditNomination(
          actor,
          'nomination.matched',
          nomination.id,
          { matchedHcpId: matchedHcp.id, matchStatus: nomination.matchStatus, matchType: 'alias' },
          {
            matchedHcpId: null,
            matchStatus: 'UNMATCHED',
            rawNameEntered: nomination.rawNameEntered,
            source: 'auto',
            reason: !aliasStillExists ? 'stale_alias_removed' : 'better_alias_match_elsewhere',
          }
        );
        cleared++;
      }
    }

    return { cleared };
  }

  /**
   * Batch top-suggestion lookup for a set of nomination IDs in one campaign.
   * Used by the nominations list page to render an inline "Accept" link per row
   * without firing one suggestions-query per row. Each entry is the top-scoring
   * candidate (or null if nothing crosses score>=50). Caller still owns the
   * decision to surface vs hide based on confidence.
   *
   * Note: `getSuggestions` is itself a multi-tier HCP search, so this is O(N)
   * per call. The list page only invokes it for the visible page (default 50),
   * which keeps the cost bounded — do not call this from background jobs.
   */
  async getTopSuggestions(
    campaignId: string,
    nominationIds: string[]
  ): Promise<Record<string, { hcpId: string; firstName: string; lastName: string; npi: string | null; score: number; matchType: 'exact' | 'primary' | 'alias' | 'partial'; isNameMatch: boolean } | null>> {
    if (!nominationIds.length) return {};

    // Tenant safety: confirm every id belongs to this campaign before computing.
    const owned = await prisma.nomination.findMany({
      where: {
        id: { in: nominationIds },
        response: { campaignId },
      },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((n) => n.id));

    const result: Record<string, { hcpId: string; firstName: string; lastName: string; npi: string | null; score: number; matchType: 'exact' | 'primary' | 'alias' | 'partial'; isNameMatch: boolean } | null> = {};
    for (const id of nominationIds) {
      if (!ownedSet.has(id)) {
        result[id] = null;
        continue;
      }
      try {
        const suggestions = await this.getSuggestions(id);
        const top = suggestions[0];
        if (!top || top.score < 50) {
          result[id] = null;
        } else {
          result[id] = {
            hcpId: top.hcp.id,
            firstName: top.hcp.firstName,
            lastName: top.hcp.lastName,
            npi: top.hcp.npi,
            score: top.score,
            matchType: top.matchType,
            isNameMatch: top.isNameMatch,
          };
        }
      } catch {
        result[id] = null;
      }
    }
    return result;
  }

  /**
   * Bulk-accept the top suggestion for each of the given nomination ids.
   *
   * Behavior is identical to clicking "Match" with the top suggestion selected,
   * for each row in turn. Skips rows where no suggestion crosses score>=50,
   * and skips rows already in MATCHED/EXCLUDED. Returns per-row outcomes so
   * the caller can show a summary; failures don't roll back successful rows
   * (this matches `bulkAutoMatch`'s best-effort semantics).
   *
   * The client-side <90% confirmation gate is purely UX — the server accepts
   * whatever the user already confirmed. Don't add a server-side floor here
   * or it will silently drop confirmed low-confidence picks.
   */
  async bulkAccept(
    campaignId: string,
    nominationIds: string[],
    matchedBy: string
  ): Promise<{
    accepted: number;
    skipped: number;
    errors: Array<{ nominationId: string; error: string }>;
  }> {
    if (!nominationIds.length) {
      return { accepted: 0, skipped: 0, errors: [] };
    }

    // Tenant scoping + filter out terminal-state rows up front.
    const candidates = await prisma.nomination.findMany({
      where: {
        id: { in: nominationIds },
        response: { campaignId },
        matchStatus: { in: ['UNMATCHED', 'REVIEW_NEEDED'] },
      },
      select: { id: true, rawNameEntered: true },
    });

    let accepted = 0;
    let skipped = 0;
    const errors: Array<{ nominationId: string; error: string }> = [];

    // Track ids that were filtered out at the candidate query stage (excluded
    // or already matched). They count as skipped, not errored.
    const candidateIds = new Set(candidates.map((c) => c.id));
    for (const id of nominationIds) {
      if (!candidateIds.has(id)) skipped++;
    }

    for (const nomination of candidates) {
      try {
        const suggestions = await this.getSuggestions(nomination.id);
        const top = suggestions[0];
        if (!top || top.score < 50) {
          skipped++;
          continue;
        }
        const shouldAddAlias = !top.isNameMatch;
        await this.matchToHcp(
          nomination.id,
          top.hcp.id,
          shouldAddAlias,
          matchedBy,
          top.matchType,
          top.score,
          true // isManual=true — steward explicitly confirmed the batch
        );
        accepted++;
      } catch (error) {
        errors.push({
          nominationId: nomination.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { accepted, skipped, errors };
  }

  async bulkAutoMatch(campaignId: string, matchedBy: string) {
    // First, clear nominations that might have stale alias matches
    // This handles the case where:
    // 1. A nomination was matched to HCP A via an alias
    // 2. The same alias was later added to HCP B
    // 3. We want to re-match to the correct HCP B
    await this.clearStaleAliasMatches(campaignId, matchedBy);

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
        // improvement — different HCP, higher score, or the new best would
        // now promote to MATCHED status (perfect name match at >=90).
        // The last clause heals rows stuck from the brief v1.15.14 window
        // where boosts could push score past 100.
        if (nomination.matchStatus === 'REVIEW_NEEDED') {
          const sameHcp = nomination.matchedHcpId === bestMatch.hcp.id;
          const currentScore = nomination.matchConfidence ?? 0;
          const wouldBeMatched =
            bestMatch.score >= 90 &&
            (bestMatch.matchType === 'exact' || bestMatch.matchType === 'alias');
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
