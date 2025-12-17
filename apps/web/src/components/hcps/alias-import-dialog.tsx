'use client';

import { useState, useRef } from 'react';
import { useImportHcpAliases } from '@/hooks/use-hcps';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AliasImportDialog({ open, onOpenChange }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<{
    total: number;
    created: number;
    skipped: number;
    errors: { row: number; error: string }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importAliases = useImportHcpAliases();

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
    if (!selectedFile) return;

    try {
      const importResult = await importAliases.mutateAsync(selectedFile);
      setResult(importResult);
    } catch (error) {
      console.error('Import failed:', error);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import HCP Aliases</DialogTitle>
          <DialogDescription>
            Upload an Excel file with NPI and alias pairs. Duplicate aliases will be skipped.
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
              <p className="font-medium mb-2">Required columns:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>NPI (10 digits) - must match an existing HCP</li>
                <li>Alias - the alternative name</li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Example: A row with NPI &quot;1234567890&quot; and Alias &quot;Dr. John Smith&quot;
                will add that alias to the HCP with the matching NPI.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!selectedFile || importAliases.isPending}
              >
                {importAliases.isPending ? 'Importing...' : 'Import'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Results */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-green-50 rounded-lg p-4">
                <CheckCircle className="w-8 h-8 mx-auto text-green-600 mb-2" />
                <p className="text-2xl font-bold text-green-600">{result.created}</p>
                <p className="text-sm text-muted-foreground">Created</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <AlertCircle className="w-8 h-8 mx-auto text-yellow-600 mb-2" />
                <p className="text-2xl font-bold text-yellow-600">{result.skipped}</p>
                <p className="text-sm text-muted-foreground">Skipped</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <XCircle className="w-8 h-8 mx-auto text-red-600 mb-2" />
                <p className="text-2xl font-bold text-red-600">{result.errors.length}</p>
                <p className="text-sm text-muted-foreground">Errors</p>
              </div>
            </div>

            {/* Errors List */}
            {result.errors.length > 0 && (
              <div className="bg-red-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                <p className="font-medium text-red-800 mb-2">Errors:</p>
                <ul className="space-y-1 text-sm text-red-700">
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
