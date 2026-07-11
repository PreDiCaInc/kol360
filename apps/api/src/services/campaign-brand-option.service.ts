import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { BrandOptionInput } from '@kol360/shared';

/**
 * Brand-Affinity Grid — CampaignBrandOption service (Phase 1).
 *
 * Ticket: docs/findings/brand-affinity-grid-nomination-plan-2026-07-08.md
 *
 * Responsibilities:
 *   - list a campaign's brand options
 *   - full-replacement upsert of the brand list
 *   - enforce the freeze-after-first-response invariant (item O)
 *   - freeze the list when the first COMPLETED response lands
 *
 * Freeze semantics:
 *   Campaign.brandsFrozenAt is NULL until any SurveyResponse for that
 *   campaign transitions to COMPLETED, at which point survey-taking
 *   sets it to that response's completedAt via
 *   freezeBrandsIfFirstResponse(). Once set, upsertBrandOptions
 *   throws BrandsFrozenError which the route maps to HTTP 409.
 */

export class BrandsFrozenError extends Error {
  readonly frozenAt: Date;
  constructor(frozenAt: Date) {
    super(`Brand list frozen after first response received on ${frozenAt.toISOString()}`);
    this.name = 'BrandsFrozenError';
    this.frozenAt = frozenAt;
  }
}

export class CampaignBrandOptionService {
  /**
   * List a campaign's brand options, ordered for stable rendering.
   * Returns [] if the campaign has no brands configured (which is the
   * expected state for any non-grid campaign).
   */
  async list(campaignId: string) {
    return prisma.campaignBrandOption.findMany({
      where: { campaignId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  /**
   * Full-replacement upsert. The caller sends the entire brand list;
   * anything not present in the payload gets deleted. Display orders
   * are normalized to 0..N-1 in the payload's array order — the
   * client-provided displayOrder values are only used to break ties in
   * the payload sort (which shouldn't happen after Zod validation
   * already rejects duplicates).
   *
   * Throws BrandsFrozenError if brandsFrozenAt is set.
   *
   * NOT idempotent by request payload alone — an unchanged payload
   * still triggers deleteMany + createMany, which will bump createdAt.
   * We could no-op when nothing changed, but the freeze guarantees this
   * only ever runs pre-first-response, so churn is not a concern.
   */
  async upsert(campaignId: string, brands: BrandOptionInput[]) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, brandsFrozenAt: true },
    });
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    if (campaign.brandsFrozenAt) {
      throw new BrandsFrozenError(campaign.brandsFrozenAt);
    }

    // Normalize display orders to 0..N-1 in the payload's array order.
    const normalized = brands.map((b, idx) => ({
      brandName: b.brandName.trim(),
      displayOrder: idx,
    }));

    return prisma.$transaction(async (tx) => {
      await tx.campaignBrandOption.deleteMany({ where: { campaignId } });
      await tx.campaignBrandOption.createMany({
        data: normalized.map((n) => ({
          campaignId,
          brandName: n.brandName,
          displayOrder: n.displayOrder,
        })),
      });
      return tx.campaignBrandOption.findMany({
        where: { campaignId },
        orderBy: { displayOrder: 'asc' },
      });
    });
  }

  /**
   * Called from the survey-taking completion path. If this is the
   * first COMPLETED response for the campaign, sets brandsFrozenAt to
   * the response's completedAt. No-op otherwise.
   *
   * Runs inside the caller's transaction (survey-taking already opens
   * one to update the response). Idempotent — safe to call on every
   * completion, even the 100th; the WHERE clause makes it a no-op
   * once the timestamp is set.
   */
  async freezeIfFirstResponse(
    campaignId: string,
    completedAt: Date,
    tx: Prisma.TransactionClient = prisma
  ): Promise<void> {
    await tx.campaign.updateMany({
      where: { id: campaignId, brandsFrozenAt: null },
      data: { brandsFrozenAt: completedAt },
    });
  }
}
