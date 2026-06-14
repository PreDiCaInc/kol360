import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { CreateHcpInput, UpdateHcpInput, normalizeHcpSpecialty } from '@kol360/shared';

// v1.17.2: the local normalizeSpecialty() that used to live here mapped CSV
// inputs to credential-form (MD/DO/OD) — a different output domain than the
// canonical normalizeHcpSpecialty from @kol360/shared (Optometry/Ophthalmology).
// Having two normalizers made it inevitable that one would be called in the
// wrong place. The v1.15.31 fix patched only the CREATE path; UPDATE + MERGE
// kept writing 'MD'/'OD'/'DO' until the v1.17.0 whitelist CHECK turned them
// into 503s on every CSV upload (latent for ~2 months, user-visible for 3
// days post-4.1.1). Removed entirely; all paths now go through the single
// canonical normalizer.

interface SearchParams {
  query?: string;
  specialty?: string;
  state?: string;
  diseaseAreaId?: string;
  diseaseAreaIds?: string[]; // Multi-select sub-specialty filter (via HcpDiseaseArea)
  hcpIds?: string[]; // Filter to specific HCP IDs (for tenant scoping)
  optOutStatus?: 'any' | 'global' | 'campaign' | 'active' | 'none'; // 'any' = any active opt-out, 'global' = global only, 'campaign' = campaign-scope only, 'none' = no opt-out, 'active' alias for 'any'
  page: number;
  limit: number;
}

export class HcpService {
  /**
   * Generate a unique Business Entity ID (BE-XXXXXX format).
   * Uses a Postgres sequence (beid_seq) for atomic, collision-free generation.
   * The sequence is also used by external apps (e.g., HCP curation tool) via direct DB access.
   */
  async generateBeId(): Promise<string> {
    const result = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('beid_seq') as nextval
    `;
    const num = Number(result[0].nextval);
    return 'BE-' + String(num).padStart(6, '0');
  }

  async search(params: SearchParams) {
    const { query, specialty, state, diseaseAreaIds, hcpIds, optOutStatus, page, limit } = params;

    const where: Record<string, unknown> = {};

    // Tenant scoping: filter to specific HCP IDs if provided
    if (hcpIds !== undefined) {
      where.id = { in: hcpIds };
    }

    // Sub-specialty filter (multi-select via HcpDiseaseArea join)
    if (diseaseAreaIds && diseaseAreaIds.length > 0) {
      where.diseaseAreas = { some: { diseaseAreaId: { in: diseaseAreaIds } } };
    }

    if (query) {
      // v1.17.34: full-name search. The previous OR-clauses ran the entire
      // query string against firstName / lastName separately, so "Paul
      // Karpecki" matched neither (firstName="Paul", lastName="Karpecki"
      // — neither contains the full string). When the query splits on
      // whitespace into 2+ tokens, build AND-pairs across firstName +
      // lastName in both orderings so the same-order ("Paul Karpecki")
      // and reversed ("Karpecki, Paul") forms both match. Single-token
      // queries keep the original behaviour exactly. Same shape as the
      // Insights side (insights-report.service.ts:613-616), just at
      // the DB layer instead of in-memory.
      const tokens = query.trim().split(/\s+/).filter(Boolean);
      const orClauses: Record<string, unknown>[] = [
        { npi: { contains: query } },
        { beId: { contains: query, mode: 'insensitive' } },
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { aliases: { some: { aliasName: { contains: query, mode: 'insensitive' } } } },
      ];
      if (tokens.length >= 2) {
        // Pair-up first and last tokens so "Paul Karpecki" matches
        // firstName=Paul + lastName=Karpecki. Both orderings so a
        // last-first phrase ("Karpecki Paul") also matches.
        const first = tokens[0];
        const last = tokens[tokens.length - 1];
        orClauses.push({
          AND: [
            { firstName: { contains: first, mode: 'insensitive' } },
            { lastName: { contains: last, mode: 'insensitive' } },
          ],
        });
        orClauses.push({
          AND: [
            { firstName: { contains: last, mode: 'insensitive' } },
            { lastName: { contains: first, mode: 'insensitive' } },
          ],
        });
      }
      where.OR = orClauses;
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

    // Opt-out filter — based on active OptOut records, keyed by EMAIL
    // (not hcpId, since email-link unsubs have no hcpId, multiple HCPs can
    // share an email, and HCP records can be re-imported losing the FK)
    if (optOutStatus) {
      const scopeFilter =
        optOutStatus === 'global' ? { scope: 'GLOBAL' as const } :
        optOutStatus === 'campaign' ? { scope: 'CAMPAIGN' as const } :
        {}; // 'any' or 'none' or 'active'
      // Pre-fetch emails of HCPs that match the opt-out criteria
      const optOutEmails = await prisma.optOut.findMany({
        where: { resubscribedAt: null, ...scopeFilter },
        select: { email: true },
        distinct: ['email'],
      });
      const emailList = optOutEmails.map(o => o.email.trim().toLowerCase());
      if (optOutStatus === 'none') {
        // HCPs whose (lowercased) email is NOT in the active opt-out list
        // (also include HCPs with no email since they can't be opted out by email)
        if (emailList.length > 0) {
          where.NOT = { email: { in: emailList, mode: 'insensitive' } };
        }
      } else {
        // 'any' / 'global' / 'campaign' — only HCPs whose email is in the list
        where.email = emailList.length > 0
          ? { in: emailList, mode: 'insensitive' }
          : { in: [] }; // no matching opt-outs → return zero rows
      }
    }

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
          diseaseAreas: {
            include: { diseaseArea: { select: { id: true, name: true, code: true } } },
            orderBy: { isPrimary: 'desc' },
          },
          diseaseAreaScores: {
            where: { isCurrent: true },
            select: {
              id: true,
              // Phase 3 PR B: scoreSurvey + compositeScore removed (vestigial,
              // dropped from HcpDiseaseAreaScore). The 8 objective columns
              // remain — canonical objective store for the analysis composite
              // live-pull. HCP detail page no longer surfaces survey/composite
              // values per the SCD reframing (those now live per-analysis on
              // HcpAnalysisScore; navigate to /admin/kol-analysis for them).
              scorePublications: true,
              scoreClinicalTrials: true,
              scoreTradePubs: true,
              scoreOrgLeadership: true,
              scoreOrgAwards: true,
              scoreConference: true,
              scoreSocialMedia: true,
              scoreMediaPodcasts: true,
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

    // Attach active opt-outs by email match (canonical key for opt-outs)
    const itemEmails = Array.from(
      new Set(
        items
          .map(h => h.email?.trim().toLowerCase())
          .filter((e): e is string => !!e)
      )
    );
    const activeOptOuts = itemEmails.length > 0
      ? await prisma.optOut.findMany({
          where: {
            email: { in: itemEmails, mode: 'insensitive' },
            resubscribedAt: null,
          },
          select: { id: true, email: true, scope: true, campaignId: true, optedOutAt: true, reason: true },
          orderBy: { optedOutAt: 'desc' },
        })
      : [];
    const optOutsByEmail = new Map<string, typeof activeOptOuts>();
    for (const o of activeOptOuts) {
      const k = o.email.trim().toLowerCase();
      const arr = optOutsByEmail.get(k) || [];
      arr.push(o);
      optOutsByEmail.set(k, arr);
    }
    const itemsWithOptOuts = items.map(h => ({
      ...h,
      optOuts: h.email ? (optOutsByEmail.get(h.email.trim().toLowerCase()) || []) : [],
    }));

    return {
      items: itemsWithOptOuts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string) {
    const hcp = await prisma.hcp.findUnique({
      where: { id },
      include: {
        aliases: true,
        specialties: {
          include: { specialty: true },
          orderBy: { isPrimary: 'desc' },
        },
        diseaseAreas: {
          include: { diseaseArea: { select: { id: true, name: true, code: true } } },
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
    if (!hcp) return null;

    // Fetch active opt-outs by email (canonical key — see opt-out.service.ts notes)
    const activeOptOuts = hcp.email
      ? await prisma.optOut.findMany({
          where: {
            email: { equals: hcp.email.trim(), mode: 'insensitive' },
            resubscribedAt: null,
          },
          include: { campaign: { select: { id: true, name: true } } },
          orderBy: { optedOutAt: 'desc' },
        })
      : [];

    return { ...hcp, optOuts: activeOptOuts };
  }

  async getByNpi(npi: string) {
    return prisma.hcp.findUnique({ where: { npi } });
  }

  async create(data: CreateHcpInput, createdBy?: string) {
    // Use atomic creation to prevent race conditions with beId generation
    return this.createWithAtomicBeId(data, createdBy);
  }

  /**
   * Create an HCP with a beId from the beid_seq sequence.
   * The sequence guarantees atomic, collision-free beId allocation across
   * all code paths (internal HCP creation and external curation app via direct DB).
   */
  async createWithAtomicBeId(data: CreateHcpInput, createdBy?: string) {
    const newBeId = await this.generateBeId();
    // diseaseAreaIds is the new multi-select sub-specialty; persist via the
    // HcpDiseaseArea join. Strip from the HCP create data — it's not a
    // column on Hcp itself.
    const { diseaseAreaIds, ...hcpData } = data;
    const created = await prisma.hcp.create({
      data: { ...hcpData, beId: newBeId, isSurveyTaker: true, createdBy },
    });
    if (diseaseAreaIds && diseaseAreaIds.length > 0) {
      await this.setHcpDiseaseAreas(created.id, diseaseAreaIds);
    }
    return created;
  }

  async update(id: string, data: UpdateHcpInput) {
    // diseaseAreaIds (multi-select sub-specialty) is a join replacement —
    // strip from Hcp update payload and reconcile via setHcpDiseaseAreas
    // when provided (undefined = leave unchanged; [] = clear).
    const { diseaseAreaIds, ...hcpData } = data;
    const updated = await prisma.hcp.update({ where: { id }, data: hcpData });
    if (diseaseAreaIds !== undefined) {
      await this.setHcpDiseaseAreas(id, diseaseAreaIds);
    }
    return updated;
  }

  /**
   * Replace the HCP's sub-specialty (DiseaseArea) set. Idempotent.
   * Mirrors setHcpSpecialties shape.
   */
  async setHcpDiseaseAreas(hcpId: string, diseaseAreaIds: string[], primaryDiseaseAreaId?: string) {
    await prisma.hcpDiseaseArea.deleteMany({ where: { hcpId } });
    if (diseaseAreaIds.length > 0) {
      await prisma.hcpDiseaseArea.createMany({
        data: diseaseAreaIds.map((diseaseAreaId) => ({
          hcpId,
          diseaseAreaId,
          isPrimary: diseaseAreaId === primaryDiseaseAreaId,
        })),
      });
    }
    return prisma.hcpDiseaseArea.findMany({
      where: { hcpId },
      include: { diseaseArea: true },
    });
  }

  async importFromFile(
    buffer: Buffer,
    userId: string,
    filename: string = 'file.xlsx',
    importId?: string,
    /** v1.17.35: if set, the new HcpImportBatch row is tagged with this
     * campaignId. The /campaigns/:id/import-hcps route passes it; the
     * generic /hcps/bulk route leaves it null. */
    campaignId?: string | null
  ) {
    const { importProgressStore } = await import('./import-progress.service');
    const rows = await this.parseFileToRows(buffer, filename);

    const result = {
      importId,
      total: rows.length,
      created: 0,
      updated: 0,
      merged: 0,
      errors: [] as { row: number; error: string }[],
      /** v1.17.35: HcpImportBatch.id for the row inserted at import end.
       * Surfaces to the caller so the route can put it in the audit log. */
      batchId: undefined as string | undefined,
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
          const rawSpecialty = (row['Specialty'] || row['specialty'] || null) as string | null;

          if (!firstName || !lastName) {
            throw new Error('First and last name required');
          }
          if (!email) {
            throw new Error('Email is required');
          }
          if (!rawSpecialty) {
            throw new Error('Specialty is required');
          }

          // v1.17.2: normalize at validation phase so UPDATE + MERGE + CREATE
          // paths all see canonical values. Pre-fix, the local normalizer
          // produced credentials (MD/DO/OD) which slipped past the v1.17.0
          // Hcp_specialty_check whitelist for UPDATE + MERGE → 503 on every
          // CSV containing existing HCPs.
          const specialty = normalizeHcpSpecialty(rawSpecialty);
          if (!specialty) {
            throw new Error(
              `Specialty "${rawSpecialty}" not recognized (expected Optometry or Ophthalmology, or aliases OD/MD/DO)`
            );
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

      // v1.17.35: track the actual IDs of created/updated rows so we
      // can persist them on the HcpImportBatch row + emit per-row audit.
      // Pre-v1.17.35 only summary counts were captured.
      const createdHcpIds: string[] = [];
      const updatedHcpIds: string[] = [...toUpdate.map(u => u.npi), ...toMerge.map(m => m.hcpId)];

      // Batch creates - pull beIds from the shared beid_seq sequence.
      // Using a sequence avoids race conditions with concurrent HCP creation
      // (e.g., single-HCP creates or other imports running at the same time).
      if (toCreate.length > 0) {
        // Reserve N beIds atomically from the sequence in a single query
        const reservedBeIds = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
          SELECT nextval('beid_seq') as nextval FROM generate_series(1, ${toCreate.length})
        `;
        const beIds = reservedBeIds.map(r => 'BE-' + String(Number(r.nextval)).padStart(6, '0'));

        for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
          const batch = toCreate.slice(i, i + BATCH_SIZE);
          const createData = batch.map((row, idx) => ({
            beId: beIds[i + idx],
            npi: row.npi,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            // v1.17.2: row.specialty is already canonical (normalized at the
            // validation phase above). Pre-fix, this line called the canonical
            // normalizer a second time to clean up output from the local
            // credential-form normalizer — that local function is gone now.
            specialty: row.specialty,
            subSpecialty: row.subSpecialty,
            city: row.city,
            state: row.state,
            isSurveyTaker: true,
            createdBy: userId,
          }));

          const createResult = await prisma.hcp.createMany({ data: createData, skipDuplicates: true });
          result.created += createResult.count;

          // v1.17.35: collect the IDs of created rows so the
          // HcpImportBatch row can persist the back-pointers. createMany
          // doesn't return IDs, so we look them up by NPI (the IDs we
          // just inserted are guaranteed unique).
          const created = await prisma.hcp.findMany({
            where: { npi: { in: batch.map(r => r.npi) } },
            select: { id: true },
          });
          createdHcpIds.push(...created.map(h => h.id));

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

      // v1.17.35: persist the HcpImportBatch row. Always written (even
      // for all-errors imports) so the audit log has a complete record.
      // Also re-resolve the updated IDs (toUpdate keyed by NPI; we want
      // ids).
      let updatedIdsResolved = toMerge.map(m => m.hcpId);
      if (toUpdate.length > 0) {
        const updatedRows = await prisma.hcp.findMany({
          where: { npi: { in: toUpdate.map(u => u.npi) } },
          select: { id: true },
        });
        updatedIdsResolved = updatedIdsResolved.concat(updatedRows.map(h => h.id));
      }

      const batch = await prisma.hcpImportBatch.create({
        data: {
          campaignId: campaignId ?? null,
          importedBy: userId,
          fileName: filename,
          recordsTotal: rows.length,
          recordsCreated: result.created,
          recordsUpdated: result.updated + result.merged,
          recordsErrored: result.errors.length,
          createdHcpIds,
          updatedHcpIds: updatedIdsResolved,
          errorRows: result.errors.length > 0 ? (result.errors as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
      result.batchId = batch.id;

      // v1.17.35: stamp the created HCPs with the batch back-pointer.
      // updateMany rather than per-row update — single SQL, cheap.
      if (createdHcpIds.length > 0) {
        await prisma.hcp.updateMany({
          where: { id: { in: createdHcpIds } },
          data: { importBatchId: batch.id },
        });
      }

      // v1.17.35: per-row audit. Single createMany insert; ~4k rows
      // typical, sub-second on Postgres. Mirrors the hcp.npi_changed
      // precedent from v1.17.34 — separate dedicated action for the
      // batch-source CREATE/UPDATE shape so audit queries can answer
      // "which CSV touched this person" without a cross-table join.
      // updateRows captures the original NPI snapshot so a future
      // "what was this row at import time" query is single-SELECT.
      // Audit table partition pressure: 4k rows per import × 50
      // imports/year ≈ 200k/yr — comfortable for the current
      // unpartitioned design (~11.6k current). Revisit at 100M.
      const auditRows: Array<{ action: string; entityId: string; metadata: Record<string, unknown> }> = [];
      for (const id of createdHcpIds) {
        auditRows.push({
          action: 'hcp.created',
          entityId: id,
          metadata: { source: 'bulk_import', batchId: batch.id, fileName: filename },
        });
      }
      for (const id of updatedIdsResolved) {
        auditRows.push({
          action: 'hcp.updated',
          entityId: id,
          metadata: { source: 'bulk_import', batchId: batch.id, fileName: filename },
        });
      }
      if (auditRows.length > 0) {
        await prisma.auditLog.createMany({
          data: auditRows.map(r => ({
            userId,
            action: r.action,
            entityType: 'Hcp',
            entityId: r.entityId,
            newValues: r.metadata as Prisma.InputJsonValue,
          })),
        });
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

    const result = { importId, total: rows.length, created: 0, updated: 0, deduped: 0, errors: [] as { row: number; error: string }[] };

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

      // Dedupe within-file: if the same NPI appears more than once in the
      // CSV, last row wins. Without this, both rows would be categorized as
      // "new" in phase 3 (the existingByHcpId map isn't updated mid-loop)
      // and the second createMany would hit the @@unique([hcpId, diseaseAreaId])
      // constraint. P2 bug flagged by prod team 2026-05-22; fix shape (1)
      // from the report — dedupe before categorization.
      const dedupedByNpi = new Map<string, typeof rowsWithHcps[number]>();
      for (const r of rowsWithHcps) dedupedByNpi.set(r.npi, r);
      result.deduped = rowsWithHcps.length - dedupedByNpi.size;
      const dedupedRows = Array.from(dedupedByNpi.values());

      const hcpIds = dedupedRows.map(r => hcpByNpi.get(r.npi)!.id);

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
      for (const row of dedupedRows) {
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
