'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Download, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useDiseaseAreas } from '@/hooks/use-hcps';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scoreType?: 'segment' | 'survey';
}

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  errors: { row: number; error: string }[];
}

interface ImportProgress {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  created: number;
  updated: number;
  errors: number;
  currentItem?: string;
  estimatedSecondsRemaining?: number;
}

export function SegmentScoreImportDialog({ open, onOpenChange, scoreType = 'segment' }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDiseaseAreaId, setSelectedDiseaseAreaId] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { data: diseaseAreas = [] } = useDiseaseAreas();

  const generateImportId = () => `import_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const pollProgress = useCallback(async (importId: string) => {
    try {
      const progressData = await api<ImportProgress>(`/api/v1/hcps/import/progress/${importId}`);
      setProgress(progressData);

      if (progressData.status === 'completed' || progressData.status === 'failed') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch {
      // Progress endpoint may not be ready yet, ignore errors
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
      setProgress(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
      setSelectedFile(file);
      setResult(null);
      setProgress(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleImport = async () => {
    if (!selectedFile || !selectedDiseaseAreaId) return;

    const importId = generateImportId();
    setIsImporting(true);
    setProgress({ id: importId, status: 'pending', total: 0, processed: 0, created: 0, updated: 0, errors: 0 });

    // Start polling for progress
    pollIntervalRef.current = setInterval(() => pollProgress(importId), 2000);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const importResult = await api<ImportResult>(
        `/api/v1/hcps/import-segment-scores?diseaseAreaId=${encodeURIComponent(selectedDiseaseAreaId)}&importId=${encodeURIComponent(importId)}`,
        {
          method: 'POST',
          body: formData,
        }
      );
      setResult(importResult);
      queryClient.invalidateQueries({ queryKey: ['hcps'] });
    } catch (error) {
      console.error('Import failed:', error);
      setResult({
        total: 0,
        created: 0,
        updated: 0,
        errors: [{ row: 0, error: 'Import failed. Please check the file format.' }],
      });
    } finally {
      setIsImporting(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  };

  const handleClose = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setSelectedFile(null);
    setSelectedDiseaseAreaId('');
    setResult(null);
    setProgress(null);
    setIsImporting(false);
    onOpenChange(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // The 8 segment score columns that map to HcpDiseaseAreaScore fields
  const segmentColumns = [
    { name: 'Research & Publications', field: 'scorePublications' },
    { name: 'Clinical Trials', field: 'scoreClinicalTrials' },
    { name: 'Trade Pubs', field: 'scoreTradePubs' },
    { name: 'Org Leadership', field: 'scoreOrgLeadership' },
    { name: 'Org Awards', field: 'scoreOrgAwards' },
    { name: 'Conference', field: 'scoreConference' },
    { name: 'Social Media', field: 'scoreSocialMedia' },
    { name: 'Media/Podcasts', field: 'scoreMediaPodcasts' },
  ];

  // The 8 survey nomination type columns
  const surveyColumns = [
    { name: 'Discussion Leaders', field: 'scoreDiscussionLeaders' },
    { name: 'Referral Leaders', field: 'scoreReferralLeaders' },
    { name: 'Advice Leaders', field: 'scoreAdviceLeaders' },
    { name: 'National Leaders', field: 'scoreNationalLeader' },
    { name: 'Rising Stars', field: 'scoreRisingStar' },
    { name: 'Social Media Leaders', field: 'scoreSocialLeader' },
    { name: 'Regional Leaders', field: 'scoreRegionalLeader' },
    { name: 'Biased Leaders', field: 'scoreBiasedLeader' },
  ];

  const columns = scoreType === 'survey' ? surveyColumns : segmentColumns;
  const title = scoreType === 'survey' ? 'Import Survey Scores' : 'Import Segment Scores';
  const description = scoreType === 'survey'
    ? 'Upload an Excel file with HCP survey nomination scores across 8 categories.'
    : 'Upload an Excel file with HCP segment scores across 8 categories.';

  const handleDownloadTemplate = () => {
    const headers = ['NPI', ...columns.map(c => c.name)];
    const exampleRow = ['1234567890', ...columns.map(() => '50')];

    const csvContent = [
      headers.join(','),
      exampleRow.join(','),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = scoreType === 'survey' ? 'survey-scores-template.csv' : 'segment-scores-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const progressPercent = progress?.total ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        {isImporting ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="font-medium">Importing {scoreType} scores...</span>
            </div>

            {progress && progress.total > 0 && (
              <>
                <Progress value={progressPercent} className="h-2" />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>
                    {progress.processed.toLocaleString()} / {progress.total.toLocaleString()} records
                  </span>
                  <span>{progressPercent}%</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="bg-green-50 dark:bg-green-950/30 rounded p-2">
                    <div className="font-semibold text-green-600">{progress.created}</div>
                    <div className="text-xs text-muted-foreground">Created</div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded p-2">
                    <div className="font-semibold text-blue-600">{progress.updated}</div>
                    <div className="text-xs text-muted-foreground">Updated</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/30 rounded p-2">
                    <div className="font-semibold text-red-600">{progress.errors}</div>
                    <div className="text-xs text-muted-foreground">Errors</div>
                  </div>
                </div>

                {progress.currentItem && (
                  <p className="text-sm text-muted-foreground">
                    Processing NPI: {progress.currentItem}
                  </p>
                )}

                {progress.estimatedSecondsRemaining !== undefined && progress.estimatedSecondsRemaining > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Estimated time remaining: {formatTime(progress.estimatedSecondsRemaining)}
                  </p>
                )}
              </>
            )}

            <p className="text-xs text-muted-foreground">
              Please keep this dialog open. Large imports may take several minutes.
            </p>
          </div>
        ) : !result ? (
          <div className="space-y-4">
            {/* Disease Area Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Disease Area <span className="text-destructive">*</span></label>
              <Select
                value={selectedDiseaseAreaId}
                onValueChange={setSelectedDiseaseAreaId}
              >
                <SelectTrigger className={!selectedDiseaseAreaId ? 'border-destructive/50' : ''}>
                  <SelectValue placeholder="Select disease area for import" />
                </SelectTrigger>
                <SelectContent>
                  {diseaseAreas.map((da) => (
                    <SelectItem key={da.id} value={da.id}>
                      {da.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedDiseaseAreaId && (
                <p className="text-xs text-muted-foreground">
                  Scores will be imported for the selected disease area
                </p>
              )}
            </div>

            {/* File Drop Zone */}
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls,.csv"
                className="hidden"
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                  <p className="font-medium">Drop file here or click to browse</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Supports .xlsx, .xls, and .csv files
                  </p>
                </div>
              )}
            </div>

            {/* Template Info */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium">Required columns:</p>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleDownloadTemplate}>
                  <Download className="w-3 h-3 mr-1" />
                  Template
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  NPI (10 digits)
                </div>
                {columns.map((col) => (
                  <div key={col.field} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                    {col.name}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Scores should be numeric values (0-100). Empty cells will be treated as no score.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!selectedFile || !selectedDiseaseAreaId}
              >
                Import Scores
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Results */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4">
                <CheckCircle className="w-8 h-8 mx-auto text-green-600 mb-2" />
                <p className="text-2xl font-bold text-green-600">{result.created}</p>
                <p className="text-sm text-muted-foreground">Created</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4">
                <AlertCircle className="w-8 h-8 mx-auto text-blue-600 mb-2" />
                <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                <p className="text-sm text-muted-foreground">Updated</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4">
                <XCircle className="w-8 h-8 mx-auto text-red-600 mb-2" />
                <p className="text-2xl font-bold text-red-600">{result.errors.length}</p>
                <p className="text-sm text-muted-foreground">Errors</p>
              </div>
            </div>

            {/* Errors List */}
            {result.errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4 max-h-48 overflow-y-auto">
                <p className="font-medium text-red-800 dark:text-red-400 mb-2">Errors:</p>
                <ul className="space-y-1 text-sm text-red-700 dark:text-red-300">
                  {result.errors.slice(0, 10).map((error, i) => (
                    <li key={i}>
                      Row {error.row}: {error.error}
                    </li>
                  ))}
                  {result.errors.length > 10 && (
                    <li className="italic">...and {result.errors.length - 10} more errors</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
