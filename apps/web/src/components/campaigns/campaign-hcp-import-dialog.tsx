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
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Download, Users } from 'lucide-react';
import { api } from '@/lib/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
}

interface ImportResult {
  total: number;
  hcpsCreated: number;
  hcpsExisting: number;
  addedToCampaign: number;
  skipped: number;
  errors: { row: number; error: string }[];
}

export function CampaignHcpImportDialog({ open, onOpenChange, campaignId }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

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
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const result = await api<ImportResult>(`/api/v1/campaigns/${campaignId}/import-hcps`, {
        method: 'POST',
        body: formData,
      });
      setResult(result);
      // Invalidate campaign HCPs and distribution queries
      queryClient.invalidateQueries({ queryKey: ['campaign-hcps', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['distribution-stats', campaignId] });
    } catch (error) {
      console.error('Import failed:', error);
      setResult({
        total: 0,
        hcpsCreated: 0,
        hcpsExisting: 0,
        addedToCampaign: 0,
        skipped: 0,
        errors: [{ row: 0, error: 'Import failed. Please check the file format.' }],
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setResult(null);
    onOpenChange(false);
  };

  const requiredColumns = [
    { name: 'NPI', description: '10-digit National Provider Identifier' },
    { name: 'First Name', description: 'HCP first name' },
    { name: 'Last Name', description: 'HCP last name' },
  ];

  const optionalColumns = [
    { name: 'Email', description: 'For survey invitations' },
    { name: 'Specialty', description: 'Medical specialty' },
    { name: 'Sub-specialty', description: 'Sub-specialty if applicable' },
    { name: 'City', description: 'City location' },
    { name: 'State', description: 'State (2-letter code)' },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Import HCPs to Campaign
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file to add HCPs to this campaign. New HCPs will be created in the central database.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
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
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium">Required columns:</p>
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  <Download className="w-3 h-3 mr-1" />
                  Template
                </Button>
              </div>
              <div className="space-y-2 mb-4">
                {requiredColumns.map((col) => (
                  <div key={col.name} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="font-medium">{col.name}</span>
                    <span className="text-muted-foreground">- {col.description}</span>
                  </div>
                ))}
              </div>
              <p className="font-medium mb-2">Optional columns:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                {optionalColumns.map((col) => (
                  <div key={col.name} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                    {col.name}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                HCPs are matched by NPI. If an HCP already exists, missing fields will be updated.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!selectedFile || isImporting}>
                {isImporting ? 'Importing...' : 'Import HCPs'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Results */}
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                <CheckCircle className="w-6 h-6 mx-auto text-green-600 mb-1" />
                <p className="text-xl font-bold text-green-600">{result.hcpsCreated}</p>
                <p className="text-xs text-muted-foreground">HCPs Created</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
                <Users className="w-6 h-6 mx-auto text-blue-600 mb-1" />
                <p className="text-xl font-bold text-blue-600">{result.hcpsExisting}</p>
                <p className="text-xs text-muted-foreground">Existing HCPs</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3">
                <CheckCircle className="w-6 h-6 mx-auto text-emerald-600 mb-1" />
                <p className="text-xl font-bold text-emerald-600">{result.addedToCampaign}</p>
                <p className="text-xs text-muted-foreground">Added to Campaign</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                <AlertCircle className="w-6 h-6 mx-auto text-amber-600 mb-1" />
                <p className="text-xl font-bold text-amber-600">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">Already in Campaign</p>
              </div>
            </div>

            {/* Errors List */}
            {result.errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4 max-h-48 overflow-y-auto">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <p className="font-medium text-red-800 dark:text-red-400">
                    {result.errors.length} Error{result.errors.length > 1 ? 's' : ''}
                  </p>
                </div>
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
