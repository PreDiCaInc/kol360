'use client';

import { useState, useRef } from 'react';
import { useImportHcps } from '@/hooks/use-hcps';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Merge } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HcpImportDialog({ open, onOpenChange }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<{
    total: number;
    created: number;
    updated: number;
    merged?: number;
    errors: { row: number; error: string }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importHcps = useImportHcps();

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
      const importResult = await importHcps.mutateAsync(selectedFile);
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
          <DialogTitle>Import HCPs</DialogTitle>
          <DialogDescription>
            Upload an Excel file with HCP data. Existing NPIs will be updated.
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
                <li>NPI (10 digits)</li>
                <li>First Name</li>
                <li>Last Name</li>
              </ul>
              <p className="font-medium mt-3 mb-2">Optional columns:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Email, Specialty, Sub-specialty</li>
                <li>City, State, Years in Practice</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!selectedFile || importHcps.isPending}
              >
                {importHcps.isPending ? 'Importing...' : 'Import'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Results */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-green-50 rounded-lg p-4">
                <CheckCircle className="w-8 h-8 mx-auto text-green-600 mb-2" />
                <p className="text-2xl font-bold text-green-600">{result.created}</p>
                <p className="text-sm text-muted-foreground">Created</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <CheckCircle className="w-8 h-8 mx-auto text-blue-600 mb-2" />
                <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                <p className="text-sm text-muted-foreground">Updated</p>
              </div>
              {(result.merged ?? 0) > 0 && (
                <div className="bg-purple-50 rounded-lg p-4">
                  <Merge className="w-8 h-8 mx-auto text-purple-600 mb-2" />
                  <p className="text-2xl font-bold text-purple-600">{result.merged}</p>
                  <p className="text-sm text-muted-foreground">Merged</p>
                </div>
              )}
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
