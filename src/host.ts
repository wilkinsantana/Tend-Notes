import type { Organization } from './organization';
/** Public Tend document capability, version 1. No imports from the host source. */
export interface Library { id: string; name: string; canCreate: boolean }
export interface Note extends Partial<Organization> { id: string; libraryId: string; name: string; modifiedAt: number | null; size: number }
export interface Document extends Note { content: string; revision: string }
export interface Page { items: Note[]; total: number; nextOffset: number | null; facets?: { total: number; pinned: number; tags: Array<{name: string; count: number}> } }
export interface BackupJob { id: string; library_id: string | null; destination_source_id: string | null; status: string; total: number; completed: number; error: string | null; filename: string; sha256: string | null; bytes: number | null; created_at: number; completed_at: number | null; cancel_requested: number; downloadAvailable: boolean }
export interface BackupState { schedule: {destination_source_id: string; interval_minutes: number; next_run_at: number | null}; jobs: BackupJob[] }
export interface Backups {
  state(): Promise<BackupState>;
  destinations(): Promise<Array<{id: string; name: string; provider: string}>>;
  configure(input: {destinationSourceId: string; intervalMinutes: number}): Promise<BackupState>;
  start(input: {libraryId?: string | null; destinationSourceId?: string | null}): Promise<BackupJob>;
  cancel(id: string): Promise<BackupJob>;
  downloadUrl(id: string): string;
}
export interface Documents {
  backups?: Backups;
  version: 1;
  libraries(): Promise<Library[]>;
  index(libraryId: string, skipped?: number): Promise<{ indexed: number; skipped: number; more: boolean }>;
  list(libraryId: string, query?: string, offset?: number, filters?: {tag?: string; color?: string; pinned?: boolean; sort?: 'recent' | 'title'}): Promise<Page>;
  read(id: string): Promise<Document>;
  create(input: { libraryId: string; name: string; content: string }): Promise<Document>;
  save(id: string, input: { content: string; revision: string }): Promise<Document>;
  delete(id: string, revision: string): Promise<void>;
}
export interface Host {
  id: string;
  user: { id: string; name: string; role: string } | null;
  documents?: Documents;
  onUnmount(fn: () => void | Promise<void>): void;
}
