/**
 * /admin/campaigns/[id]/scores — REDIRECT
 *
 * Phase 3 PR A (v1.16.0) removed campaign-level scoring. Score weights +
 * recalc now live on the KOL Analysis dashboard per (client, disease area).
 * The page that used to live here is gone; any bookmark or muscle-memory
 * click on /admin/campaigns/<id>/scores lands at /admin/kol-analysis
 * instead.
 *
 * Why redirect (vs 404): polite, lossless — steward gets to the new home
 * in one transparent hop. Drop this redirect file in a future release
 * once stewards have retrained (~6 months).
 */
import { redirect } from 'next/navigation';

export default function CampaignScoresRedirectPage() {
  redirect('/admin/kol-analysis');
}
