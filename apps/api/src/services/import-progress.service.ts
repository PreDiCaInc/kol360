/**
 * In-memory import progress tracking
 * Stores progress for ongoing imports and bulk email sends so frontend can poll for updates
 */

type ProgressType = 'hcp' | 'segment-scores' | 'survey-scores' | 'email-invitations' | 'email-reminders';

interface ImportProgress {
  id: string;
  type: ProgressType;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  created: number;  // For emails: "sent" count
  updated: number;  // For emails: "skipped" count
  errors: number;
  skipped?: number; // Detailed skip count for email operations
  startedAt: Date;
  completedAt?: Date;
  currentItem?: string; // Current NPI, name, or email being processed
  estimatedSecondsRemaining?: number;
  /** Stores the full result object for email operations */
  resultData?: Record<string, unknown>;
}

class ImportProgressStore {
  private progress: Map<string, ImportProgress> = new Map();
  private avgTimePerRecord: Map<string, number> = new Map(); // Track avg processing time

  /**
   * Start tracking a new import
   */
  start(id: string, type: ProgressType, total: number): ImportProgress {
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
    updates: Partial<Pick<ImportProgress, 'processed' | 'created' | 'updated' | 'errors' | 'skipped' | 'currentItem'>>
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
  complete(id: string, result: { created: number; updated: number; errors: number; resultData?: Record<string, unknown> }): ImportProgress | undefined {
    const progress = this.progress.get(id);
    if (!progress) return undefined;

    progress.status = 'completed';
    progress.completedAt = new Date();
    progress.processed = progress.total;
    progress.created = result.created;
    progress.updated = result.updated;
    progress.errors = result.errors;
    progress.estimatedSecondsRemaining = 0;
    if (result.resultData) progress.resultData = result.resultData;

    // Email operations take longer; keep result available for 30 min, others 5 min
    const isEmail = progress.type === 'email-invitations' || progress.type === 'email-reminders';
    const expiryMs = isEmail ? 30 * 60 * 1000 : 5 * 60 * 1000;
    setTimeout(() => this.progress.delete(id), expiryMs);

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

    // Email operations: 30 min expiry, others: 5 min
    const isEmail = progress.type === 'email-invitations' || progress.type === 'email-reminders';
    const expiryMs = isEmail ? 30 * 60 * 1000 : 5 * 60 * 1000;
    setTimeout(() => this.progress.delete(id), expiryMs);

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
  getEstimatedTime(type: ProgressType, total: number): number {
    const avgMs = this.avgTimePerRecord.get(type) || 150; // Default 150ms per record
    return Math.ceil((total * avgMs) / 1000);
  }

  /**
   * Find an active (processing) progress entry by a key prefix in the ID.
   * Used for concurrent-send guard: IDs are formatted as `email-inv:{campaignId}` or `email-rem:{campaignId}`.
   */
  findActiveByKey(keyPrefix: string): ImportProgress | undefined {
    for (const progress of this.progress.values()) {
      if (progress.id.startsWith(keyPrefix) && progress.status === 'processing') {
        return progress;
      }
    }
    return undefined;
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
