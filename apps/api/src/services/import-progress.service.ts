/**
 * In-memory import progress tracking
 * Stores progress for ongoing imports so frontend can poll for updates
 */

interface ImportProgress {
  id: string;
  type: 'hcp' | 'segment-scores' | 'survey-scores';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  created: number;
  updated: number;
  errors: number;
  startedAt: Date;
  completedAt?: Date;
  currentItem?: string; // Current NPI or name being processed
  estimatedSecondsRemaining?: number;
}

class ImportProgressStore {
  private progress: Map<string, ImportProgress> = new Map();
  private avgTimePerRecord: Map<string, number> = new Map(); // Track avg processing time

  /**
   * Start tracking a new import
   */
  start(id: string, type: ImportProgress['type'], total: number): ImportProgress {
    const progress: ImportProgress = {
      id,
      type,
      status: 'processing',
      total,
      processed: 0,
      created: 0,
      updated: 0,
      errors: 0,
      startedAt: new Date(),
    };
    this.progress.set(id, progress);
    return progress;
  }

  /**
   * Update progress for an import
   */
  update(
    id: string,
    updates: Partial<Pick<ImportProgress, 'processed' | 'created' | 'updated' | 'errors' | 'currentItem'>>
  ): ImportProgress | undefined {
    const progress = this.progress.get(id);
    if (!progress) return undefined;

    Object.assign(progress, updates);

    // Calculate estimated time remaining based on actual processing speed
    if (progress.processed > 0) {
      const elapsedMs = Date.now() - progress.startedAt.getTime();
      const avgMsPerRecord = elapsedMs / progress.processed;
      const remaining = progress.total - progress.processed;
      progress.estimatedSecondsRemaining = Math.ceil((remaining * avgMsPerRecord) / 1000);

      // Store avg time for this import type
      this.avgTimePerRecord.set(progress.type, avgMsPerRecord);
    }

    return progress;
  }

  /**
   * Mark import as completed
   */
  complete(id: string, result: { created: number; updated: number; errors: number }): ImportProgress | undefined {
    const progress = this.progress.get(id);
    if (!progress) return undefined;

    progress.status = 'completed';
    progress.completedAt = new Date();
    progress.processed = progress.total;
    progress.created = result.created;
    progress.updated = result.updated;
    progress.errors = result.errors;
    progress.estimatedSecondsRemaining = 0;

    // Clean up after 5 minutes
    setTimeout(() => this.progress.delete(id), 5 * 60 * 1000);

    return progress;
  }

  /**
   * Mark import as failed
   */
  fail(id: string, error: string): ImportProgress | undefined {
    const progress = this.progress.get(id);
    if (!progress) return undefined;

    progress.status = 'failed';
    progress.completedAt = new Date();
    progress.currentItem = error;

    // Clean up after 5 minutes
    setTimeout(() => this.progress.delete(id), 5 * 60 * 1000);

    return progress;
  }

  /**
   * Get progress for an import
   */
  get(id: string): ImportProgress | undefined {
    return this.progress.get(id);
  }

  /**
   * Get estimated time for a new import based on historical data
   */
  getEstimatedTime(type: ImportProgress['type'], total: number): number {
    const avgMs = this.avgTimePerRecord.get(type) || 150; // Default 150ms per record
    return Math.ceil((total * avgMs) / 1000);
  }

  /**
   * Generate a unique import ID
   */
  generateId(): string {
    return `import_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Singleton instance
export const importProgressStore = new ImportProgressStore();
