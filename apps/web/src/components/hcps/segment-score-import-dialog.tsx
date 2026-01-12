'use client';

import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react';
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

export function SegmentScoreImportDialog({ open, onOpenChange, scoreType = 'segment' }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDiseaseAreaId, setSelectedDiseaseAreaId] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { data: diseaseAreas = [] } = useDiseaseAreas();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleImport = async () => {
    if (!selectedFile || !selectedDiseaseAreaId) return;

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('diseaseAreaId', selectedDiseaseAreaId);
      formData.append('scoreType', scoreType);

      const result = await api<ImportResult>('/api/v1/hcps/import-segment-scores', {
        method: 'POST',
        body: formData,
      });
      setResult(result);
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
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setSelectedDiseaseAreaId('');
    setResult(null);
    onOpenChange(false);
  };

  // The 8 segment score columns that map to HcpDiseaseAreaScore fields
  const segmentColumns = [
    { name: 'Research & Publications', field: 'scorePublications' },
    { name: 'Clinical Trials', field: 'scoreClinicalTrials' },
    { name: 'Trade Pubs', field: 'scoreTradePubs' },
    { name: 'Org Leadership', field: 'scoreOrgLeadership' },
    { name: 'Org Awareness', field: 'scoreOrgAwareness' },
    { name: 'Conference', field: 'scoreConference' },
    { name: 'Social Media', field: 'scoreSocialMedia' },
    { name: 'Media/Podcasts', field: 'scoreMediaPodcasts' },
  ];

  // The 6 survey nomination type columns
  const surveyColumns = [
    { name: 'Discussion Leaders', field: 'scoreDiscussionLeaders' },
    { name: 'Referral Leaders', field: 'scoreReferralLeaders' },
    { name: 'Advice Leaders', field: 'scoreAdviceLeaders' },
    { name: 'National Leader', field: 'scoreNationalLeader' },
    { name: 'Rising Star', field: 'scoreRisingStar' },
    { name: 'Social Leader', field: 'scoreSocialLeader' },
  ];

  const columns = scoreType === 'survey' ? surveyColumns : segmentColumns;
  const title = scoreType === 'survey' ? 'Import Survey Scores' : 'Import Segment Scores';
  const description = scoreType === 'survey'
    ? 'Upload an Excel file with HCP survey nomination scores across 6 categories.'
    : 'Upload an Excel file with HCP segment scores across 8 categories.';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
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
                accept=".xlsx,.xls"
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
                  <p className="font-medium">Drop Excel file here or click to browse</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Supports .xlsx and .xls files
                  </p>
                </div>
              )}
            </div>

            {/* Template Info */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium">Required columns:</p>
                <Button variant="ghost" size="sm" className="text-xs h-7">
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
                disabled={!selectedFile || !selectedDiseaseAreaId || isImporting}
              >
                {isImporting ? 'Importing...' : 'Import Scores'}
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
