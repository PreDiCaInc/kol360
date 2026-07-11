'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, ArrowDown, ArrowUp, Lock, Plus, Save, Trash2 } from 'lucide-react';
import {
  useBrandOptions,
  useUpsertBrandOptions,
  useUpdateSurveyQuestionBrandGrid,
} from '@/hooks/use-brand-options';
import { useSurveyPreview } from '@/hooks/use-campaigns';
import {
  BRAND_NAME_MAX_LENGTH,
  CAMPAIGN_MAX_BRANDS,
  nominationTypeLabel,
} from '@kol360/shared';

/**
 * v1.17.79 — Brand-Affinity Grid config section (Phase 1 UI).
 *
 * Spec: docs/findings/brand-affinity-grid-nomination-plan-2026-07-08.md
 *
 * Renders on the Campaign overview tab. Two sub-sections:
 *   (1) Brand list — admin defines the brands respondents will flag
 *       nominations against. Add / edit name / remove / reorder.
 *       Full-replacement save via PUT /brand-options. Locks with a
 *       banner once brandsFrozenAt is set (first response received).
 *   (2) Per-question grid opt-in — for each nomination question on
 *       the campaign, a toggle to include the brand grid inline on
 *       that question's respondent UX. Only rendered when there is
 *       ≥1 brand configured (item L).
 */

interface CampaignBrandGridSectionProps {
  campaignId: string;
  canEdit: boolean;
}

// Local draft row shape. `id` on server-side rows is preserved for stable
// keys; new rows carry a client-generated id so React keys stay stable
// across re-renders.
interface DraftRow {
  key: string;
  serverId: string | null;
  brandName: string;
}

let draftKeySeq = 0;
function nextKey() {
  return `draft-${++draftKeySeq}`;
}

export function CampaignBrandGridSection({
  campaignId,
  canEdit,
}: CampaignBrandGridSectionProps) {
  const brandOptionsQuery = useBrandOptions(campaignId);
  const surveyPreviewQuery = useSurveyPreview(campaignId);
  const upsertBrandOptions = useUpsertBrandOptions();
  const toggleQuestionGrid = useUpdateSurveyQuestionBrandGrid();

  const serverBrands = brandOptionsQuery.data?.brandOptions ?? [];
  const brandsFrozenAt = brandOptionsQuery.data?.brandsFrozenAt ?? null;
  const isFrozen = !!brandsFrozenAt;
  const isReadOnly = !canEdit || isFrozen;

  const [draft, setDraft] = useState<DraftRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync server brands into local draft on load or after a save. Preserves
  // in-flight edits by only resyncing when the query settles into a new
  // "clean" state.
  useEffect(() => {
    if (!brandOptionsQuery.data) return;
    setDraft(
      serverBrands.map((b) => ({
        key: b.id,
        serverId: b.id,
        brandName: b.brandName,
      }))
    );
    setErrorMessage(null);
    // We intentionally do NOT depend on `draft` here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandOptionsQuery.data]);

  const isDirty = useMemo(() => {
    if (draft.length !== serverBrands.length) return true;
    return draft.some((d, i) => d.brandName !== serverBrands[i]?.brandName);
  }, [draft, serverBrands]);

  const isEmpty = draft.length === 0;
  const atMaxCapacity = draft.length >= CAMPAIGN_MAX_BRANDS;

  // Locally-validatable draft state — the server does the authoritative
  // Zod check, but surfacing obvious issues before save is friendlier.
  const draftIssue: string | null = useMemo(() => {
    const trimmed = draft.map((d) => d.brandName.trim().toLowerCase()).filter(Boolean);
    if (trimmed.length !== draft.length) {
      return null; // empty rows are checked at save-time
    }
    if (new Set(trimmed).size !== trimmed.length) {
      return 'Brand names must be unique (case-insensitive).';
    }
    if (draft.some((d) => d.brandName.length > BRAND_NAME_MAX_LENGTH)) {
      return `Brand name cannot exceed ${BRAND_NAME_MAX_LENGTH} characters.`;
    }
    return null;
  }, [draft]);

  function addRow() {
    if (atMaxCapacity) return;
    setDraft((prev) => [
      ...prev,
      { key: nextKey(), serverId: null, brandName: '' },
    ]);
  }

  function removeRow(key: string) {
    setDraft((prev) => prev.filter((r) => r.key !== key));
  }

  function updateRowName(key: string, brandName: string) {
    setDraft((prev) =>
      prev.map((r) => (r.key === key ? { ...r, brandName } : r))
    );
  }

  function moveRow(key: string, direction: -1 | 1) {
    setDraft((prev) => {
      const idx = prev.findIndex((r) => r.key === key);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function saveBrands() {
    setErrorMessage(null);
    const trimmed = draft.map((d) => d.brandName.trim());
    if (trimmed.some((n) => !n)) {
      setErrorMessage('Every brand needs a name.');
      return;
    }
    if (trimmed.length === 0) {
      setErrorMessage('At least one brand is required to save.');
      return;
    }

    try {
      await upsertBrandOptions.mutateAsync({
        campaignId,
        brands: trimmed.map((brandName, idx) => ({
          brandName,
          displayOrder: idx,
        })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save brands';
      // apiClient throws for 4xx/5xx — surface the server message when
      // available (the freeze 409 carries a helpful string).
      setErrorMessage(msg);
    }
  }

  function resetToServer() {
    setDraft(
      serverBrands.map((b) => ({
        key: b.id,
        serverId: b.id,
        brandName: b.brandName,
      }))
    );
    setErrorMessage(null);
  }

  const nominationQuestions =
    surveyPreviewQuery.data?.questions.filter((q) => q.nominationType) ?? [];
  const showQuestionToggles = serverBrands.length > 0 && nominationQuestions.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Brand-Affinity Grid
          {isFrozen && <Lock className="h-4 w-4 text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Configure a list of drug brands. In Grid mode, each nominated HCP is
          accompanied by a mutually-exclusive grid (brands + Neutral + Don&apos;t
          Know) on every enabled nomination question. Leave the list empty to
          keep this campaign in Classic mode.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isFrozen && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Brand list is frozen.</p>
              <p className="text-xs">
                First survey response was received on{' '}
                <span className="font-medium">
                  {new Date(brandsFrozenAt!).toLocaleString()}
                </span>
                . Contact support to change the brand list after this point.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              Brands ({draft.length}
              {atMaxCapacity ? ` / ${CAMPAIGN_MAX_BRANDS}` : ''})
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
              disabled={isReadOnly || atMaxCapacity}
            >
              <Plus className="h-4 w-4 mr-1" /> Add brand
            </Button>
          </div>

          {isEmpty ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No brands configured. This campaign is in Classic mode. Add a
              brand to switch to Grid mode.
            </p>
          ) : (
            <ul className="space-y-2">
              {draft.map((row, idx) => (
                <li
                  key={row.key}
                  className="flex items-center gap-2 rounded-lg border p-2"
                >
                  <span className="w-6 text-right text-xs text-muted-foreground">
                    {idx + 1}
                  </span>
                  <Input
                    value={row.brandName}
                    onChange={(e) => updateRowName(row.key, e.target.value)}
                    placeholder={`Brand ${idx + 1}`}
                    maxLength={BRAND_NAME_MAX_LENGTH}
                    disabled={isReadOnly || upsertBrandOptions.isPending}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => moveRow(row.key, -1)}
                    disabled={
                      isReadOnly ||
                      upsertBrandOptions.isPending ||
                      idx === 0
                    }
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => moveRow(row.key, 1)}
                    disabled={
                      isReadOnly ||
                      upsertBrandOptions.isPending ||
                      idx === draft.length - 1
                    }
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(row.key)}
                    disabled={isReadOnly || upsertBrandOptions.isPending}
                    aria-label="Remove brand"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {(draftIssue || errorMessage) && (
            <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-900">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{errorMessage ?? draftIssue}</span>
            </div>
          )}

          {!isReadOnly && (
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetToServer}
                disabled={!isDirty || upsertBrandOptions.isPending}
              >
                Reset
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveBrands}
                disabled={
                  !isDirty || !!draftIssue || upsertBrandOptions.isPending
                }
              >
                <Save className="h-4 w-4 mr-1" />
                {upsertBrandOptions.isPending ? 'Saving…' : 'Save brands'}
              </Button>
            </div>
          )}
        </div>

        {showQuestionToggles && (
          <div className="space-y-2 border-t pt-4">
            <label className="text-sm font-medium">
              Enable grid on nomination questions
            </label>
            <p className="text-xs text-muted-foreground">
              Respondents will see the brand grid inline on every enabled
              nomination question. The classic Biased Leader question is
              suppressed in Grid mode — the brand grid supersedes it.
            </p>
            <ul className="space-y-2">
              {nominationQuestions.map((q) => (
                <li
                  key={q.id}
                  className="flex items-center justify-between rounded-lg border p-2"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-sm font-medium">
                      {q.nominationType
                        ? nominationTypeLabel(q.nominationType)
                        : 'Nomination question'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {q.text}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={q.useBrandGrid}
                    onClick={async () => {
                      if (isReadOnly) return;
                      try {
                        await toggleQuestionGrid.mutateAsync({
                          campaignId,
                          surveyQuestionId: q.id,
                          useBrandGrid: !q.useBrandGrid,
                        });
                      } catch (err) {
                        const msg =
                          err instanceof Error
                            ? err.message
                            : 'Failed to toggle brand grid';
                        setErrorMessage(msg);
                      }
                    }}
                    disabled={isReadOnly || toggleQuestionGrid.isPending}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      q.useBrandGrid ? 'bg-primary' : 'bg-gray-300'
                    } ${isReadOnly ? 'cursor-not-allowed opacity-70' : ''}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        q.useBrandGrid ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
