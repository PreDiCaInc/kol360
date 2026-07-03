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
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Merge, Download, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  merged?: number;
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

export function HcpImportDialog({ open, onOpenChange }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  // v1.17.68 — country regime for this import batch. Determines
  // which identifier column format is expected (NPI 10-digits vs MINC
  // CA-MD-####-###-#) and what value lands in the row's `country`
  // + `nationalIdType` on created rows. Default 'US' — the vast
  // majority of imports today. Admin picks 'CA' when loading a
  // Canadian roster.
  const [importCountry, setImportCountry] = useState<'US' | 'CA'>('US');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
    if (!selectedFile) return;

    const importId = generateImportId();
    setIsImporting(true);
    setProgress({ id: importId, status: 'pending', total: 0, processed: 0, created: 0, updated: 0, errors: 0 });

    // Start polling for progress
    pollIntervalRef.current = setInterval(() => pollProgress(importId), 2000);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const importResult = await api<ImportResult>(
        `/api/v1/hcps/import?importId=${encodeURIComponent(importId)}&country=${importCountry}`,
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
    setResult(null);
    setProgress(null);
    setIsImporting(false);
    setImportCountry('US');
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

  const handleDownloadTemplate = () => {
    const idColumn = importCountry === 'CA' ? 'MINC' : 'NPI';
    const sampleId = importCountry === 'CA' ? 'CAMD12345678' : '1234567890';
    const sampleState = importCountry === 'CA' ? 'ON' : 'MA';
    const headers = [idColumn, 'First Name', 'Last Name', 'Email', 'Specialty', 'Sub-specialty', 'City', 'State'];
    const sampleRow = [sampleId, 'John', 'Smith', 'john.smith@example.com', 'Oncology', '', 'Boston', sampleState];

    const csvContent = [
      headers.join(','),
      sampleRow.join(','),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `hcp-import-template-${importCountry.toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import HCPs</DialogTitle>
          <DialogDescription>
            Upload an Excel file with HCP data. Existing NPIs will be updated.
          </DialogDescription>
        </DialogHeader>

        {isImporting ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="font-medium">Importing HCPs...</span>
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
                    Processing: {progress.currentItem}
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
            {/* v1.17.68 — country selector. Determines which national-
                ID column format the CSV needs to carry + how the
                validator interprets each row. Default US matches every
                pre-Canada import. */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">HCP Country:</label>
              <div className="inline-flex rounded-md border">
                <button
                  type="button"
                  onClick={() => setImportCountry('US')}
                  className={`px-3 py-1.5 text-sm ${importCountry === 'US' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                >
                  United States (NPI)
                </button>
                <button
                  type="button"
                  onClick={() => setImportCountry('CA')}
                  className={`px-3 py-1.5 text-sm border-l ${importCountry === 'CA' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                >
                  Canada (MINC)
                </button>
              </div>
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
              <div className="flex justify-between items-start mb-2">
                <p className="font-medium">Required columns:</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="h-7 text-xs"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Download Template
                </Button>
              </div>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>
                  {importCountry === 'CA'
                    ? 'MINC (12-char CA-MD-####-###-# — hyphens optional)'
                    : 'NPI (10 digits)'}
                </li>
                <li>First Name</li>
                <li>Last Name</li>
                <li>Email</li>
                <li>Specialty</li>
              </ul>
              <p className="font-medium mt-3 mb-2">Optional columns:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Sub-specialty, City, State</li>
              </ul>
              <p className="font-medium mt-3 mb-1">Auto-transformations:</p>
              <p className="text-muted-foreground">Specialty values are standardized on import: OD → Optometry, MD/DO → Ophthalmology</p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!selectedFile}>
                Import
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Results */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4">
                <CheckCircle className="w-8 h-8 mx-auto text-green-600 mb-2" />
                <p className="text-2xl font-bold text-green-600">{result.created}</p>
                <p className="text-sm text-muted-foreground">Created</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4">
                <CheckCircle className="w-8 h-8 mx-auto text-blue-600 mb-2" />
                <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                <p className="text-sm text-muted-foreground">Updated</p>
              </div>
              {(result.merged ?? 0) > 0 && (
                <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-4">
                  <Merge className="w-8 h-8 mx-auto text-purple-600 mb-2" />
                  <p className="text-2xl font-bold text-purple-600">{result.merged}</p>
                  <p className="text-sm text-muted-foreground">Merged</p>
                </div>
              )}
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
                    <li className="italic">
                      ...and {result.errors.length - 10} more errors
                    </li>
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
