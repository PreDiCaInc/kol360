'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { useDiseaseAreas } from '@/hooks/use-disease-areas';
import {
  useInfluencerTypePreview,
  useInfluencerTypeImport,
  type InfluencerTypeImportResult,
} from '@/hooks/use-hcps';
import { INFLUENCER_TYPES } from '@kol360/shared';
import { Badge } from '@/components/ui/badge';

// v1.17.42 — data-team-managed influencer-type classification import.
// CSV format: NPI,InfluencerType. v1.17.44 — 5 canonical values:
// 'National Leaders', 'Rising Stars', 'Regional Influencers',
// 'Regional Leaders', 'Pre-Emergent' (case + singular alternates +
// 'Pre Emergent' / 'Preemergent' variants accepted by the backend).
//
// Two-step UX:
//   1. Pick disease area + upload CSV → POST /preview returns summary
//      counts + per-row resolution
//   2. Confirmation: "500 HCPs will be classified for Dry Eye. Continue?"
//   3. POST /import → result toast

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// v1.17.43 — auth is now via useInfluencerTypePreview / useInfluencerTypeImport
// hooks (mutationFn awaits the live Cognito getToken). The previous
// 4.1.22 dialog rolled its own authToken() that read from localStorage
// keys ('id_token' / 'access_token') the app doesn't actually use, so
// the Authorization header was always dropped and the backend rejected
// with 'Missing or invalid authorization header'.

export function InfluencerTypeImportDialog({ open, onOpenChange }: Props) {
  const [diseaseAreaId, setDiseaseAreaId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<InfluencerTypeImportResult | null>(null);
  const [final, setFinal] = useState<InfluencerTypeImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: diseaseAreas } = useDiseaseAreas();
  const previewMutation = useInfluencerTypePreview();
  const importMutation = useInfluencerTypeImport();
  const busy = previewMutation.isPending || importMutation.isPending;

  const selectedDiseaseAreaName =
    diseaseAreas?.items?.find((d) => d.id === diseaseAreaId)?.name ?? '';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreview(null);
      setFinal(null);
      setError(null);
    }
  };

  const handlePreview = async () => {
    if (!selectedFile || !diseaseAreaId) return;
    setError(null);
    try {
      const result = await previewMutation.mutateAsync({
        file: selectedFile,
        diseaseAreaId,
      });
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !diseaseAreaId) return;
    setError(null);
    try {
      const result = await importMutation.mutateAsync({
        file: selectedFile,
        diseaseAreaId,
      });
      setFinal(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    }
  };

  const handleClose = () => {
    setDiseaseAreaId('');
    setSelectedFile(null);
    setPreview(null);
    setFinal(null);
    setError(null);
    onOpenChange(false);
  };

  // v1.17.43 — mirror the HcpImportDialog pattern: provide a
  // template so the data team doesn't have to guess the column shape.
  const handleDownloadTemplate = () => {
    const headers = ['NPI', 'InfluencerType'];
    // v1.17.44 — derive sample rows from the shared canonical list so
    // adding a type to influencer-types.ts auto-includes it in the
    // downloaded template. NPI just increments from a known test range.
    const sampleRows = INFLUENCER_TYPES.map((t, i) => [
      `99900000${String(i + 1).padStart(2, '0')}`,
      t,
    ]);
    const csv = [
      headers.join(','),
      ...sampleRows.map((r) => r.join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'influencer-types-template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Influencer Type Classifications</DialogTitle>
          <DialogDescription>
            Upload a CSV / XLSX / XLS file with NPI + InfluencerType
            columns and pick the disease area the classifications apply to.
          </DialogDescription>
          {/* v1.17.44 — render the canonical list as badges from the
              @kol360/shared single source of truth. Adding a new type
              only requires updating influencer-types.ts; this UI
              auto-updates. */}
          <div className="pt-2">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              Allowed types (case-insensitive, singular/hyphen variants accepted):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {INFLUENCER_TYPES.map((t) => (
                <Badge key={t} variant="secondary" className="font-mono text-[11px]">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        </DialogHeader>

        {!final ? (
          <div className="space-y-4">
            {/* Disease area selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Disease Area</label>
              <Select value={diseaseAreaId} onValueChange={setDiseaseAreaId} disabled={!!preview}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a disease area..." />
                </SelectTrigger>
                <SelectContent>
                  {diseaseAreas?.items?.map((da) => (
                    <SelectItem key={da.id} value={da.id}>
                      {da.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* File picker */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">File (CSV, XLSX, or XLS)</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Template
                </Button>
              </div>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => !preview && fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  disabled={!!preview}
                />
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileSpreadsheet className="w-7 h-7 text-green-600" />
                    <div className="text-left">
                      <p className="font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="w-7 h-7 text-muted-foreground" />
                    <p className="text-sm">Click to choose a file</p>
                  </div>
                )}
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 text-destructive flex-shrink-0" />
                <div>{error}</div>
              </div>
            )}

            {/* Preview summary */}
            {preview && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-4">
                <h4 className="font-semibold text-sm">
                  Based on this file, <span className="text-primary">{preview.matched}</span>{' '}
                  HCPs will be classified for <span className="text-primary">{selectedDiseaseAreaName}</span>.
                </h4>
                <ul className="text-sm space-y-1 mt-2">
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Total rows in file:</span>
                    <span className="font-mono tabular-nums">{preview.totalRows}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Will classify:</span>
                    <span className="font-mono tabular-nums text-green-700 dark:text-green-400">
                      {preview.matched}
                    </span>
                  </li>
                  {preview.unmatchedNpi > 0 && (
                    <li className="flex justify-between">
                      <span className="text-muted-foreground">NPI not found:</span>
                      <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                        {preview.unmatchedNpi}
                      </span>
                    </li>
                  )}
                  {preview.unmatchedDiseaseArea > 0 && (
                    <li className="flex justify-between">
                      <span className="text-muted-foreground">HCP not linked to this disease area:</span>
                      <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                        {preview.unmatchedDiseaseArea}
                      </span>
                    </li>
                  )}
                  {preview.invalidType > 0 && (
                    <li className="flex justify-between">
                      <span className="text-muted-foreground">Unknown influencer type:</span>
                      <span className="font-mono tabular-nums text-destructive">
                        {preview.invalidType}
                      </span>
                    </li>
                  )}
                </ul>
                <hr className="my-2" />
                <div className="text-sm">
                  <p className="font-medium mb-1">Breakdown by type</p>
                  <ul className="space-y-0.5">
                    {Object.entries(preview.countsByType).map(([type, n]) => (
                      <li key={type} className="flex justify-between">
                        <span className="text-muted-foreground">{type}:</span>
                        <span className="font-mono tabular-nums">{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {preview.errorRows.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-sm font-medium cursor-pointer">
                      Show errors ({preview.errorRows.length})
                    </summary>
                    <div className="mt-2 max-h-40 overflow-y-auto rounded bg-background border p-2 text-xs">
                      <ul className="space-y-0.5">
                        {preview.errorRows.slice(0, 50).map((e, i) => (
                          <li key={i} className="font-mono">
                            Row {e.row} (NPI {e.npi || '—'}): {e.reason}
                          </li>
                        ))}
                        {preview.errorRows.length > 50 && (
                          <li className="text-muted-foreground italic">
                            …{preview.errorRows.length - 50} more
                          </li>
                        )}
                      </ul>
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Final result */
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">
                  Classified {final.matched} HCPs for {selectedDiseaseAreaName}.
                </p>
                <p className="text-muted-foreground mt-1">
                  Influencer-type values are now active in Insights for this disease area.
                </p>
                {final.errorRows.length > 0 && (
                  <p className="text-amber-700 dark:text-amber-400 mt-1">
                    {final.errorRows.length} rows were skipped — see preview output for
                    error details. Re-upload after fixing.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {!preview && !final && (
            <>
              <Button variant="outline" onClick={handleClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                onClick={handlePreview}
                disabled={!selectedFile || !diseaseAreaId || busy}
              >
                {busy ? 'Previewing…' : 'Preview'}
              </Button>
            </>
          )}
          {preview && !final && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setSelectedFile(null);
                }}
                disabled={busy}
              >
                Choose different file
              </Button>
              <Button
                onClick={handleImport}
                disabled={busy || preview.matched === 0}
              >
                {busy ? 'Importing…' : `Confirm: classify ${preview.matched} HCPs`}
              </Button>
            </>
          )}
          {final && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
