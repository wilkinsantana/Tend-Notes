import type { Organization } from './organization';
/** Public Tend document capability, version 1. No imports from the host source. */
export interface Library { id: string; name: string; canCreate: boolean }
export interface Note extends Partial<Organization> { id: string; libraryId: string; name: string; modifiedAt: number | null; size: number }
export interface Document extends Note { content: string; revision: string; canWrite?: boolean }
export interface Page { items: Note[]; total: number; nextOffset: number | null; facets?: { total: number; pinned: number; tags: Array<{name: string; count: number}> } }
export interface BackupJob { id: string; library_id: string | null; destination_source_id: string | null; status: string; total: number; completed: number; error: string | null; filename: string; sha256: string | null; bytes: number | null; created_at: number; completed_at: number | null; cancel_requested: number; downloadAvailable: boolean }
export interface BackupState { schedule: {destination_source_id: string; interval_minutes: number; next_run_at: number | null}; jobs: BackupJob[] }
export interface Backups {
  setupDestination?(): Promise<{id: string; name: string; provider: string} | null>;
  state(): Promise<BackupState>;
  destinations(): Promise<Array<{id: string; name: string; provider: string}>>;
  configure(input: {destinationSourceId: string; intervalMinutes: number}): Promise<BackupState>;
  start(input: {libraryId?: string | null; destinationSourceId?: string | null}): Promise<BackupJob>;
  cancel(id: string): Promise<BackupJob>;
  downloadUrl(id: string): string;
}
export interface Documents {
  sharing?: {
    version: 1;
    list(id: string): Promise<{items:Array<{id:string;permission:'view'|'edit';expiresAt:number;allowAttachments:boolean;revoked?:boolean}>;recoveryDocuments?:Array<{documentId:string;createdAt:number;status:string}>}>;
    create(id:string,input:{permission:'view'|'edit';passcode:string|null;ttlSeconds:number;allowAttachments:boolean}):Promise<{id:string;secret:string}>;
    revoke(id:string,linkId:string):Promise<unknown>;
    session(id:string):Promise<{session:string}>;
    stop(id:string):Promise<unknown>;
    recovery(id:string,documentId?:string):Promise<{savedContent:string;currentContent:string;candidateContent:string|null;status:string}>;
    qr?(url:string):Promise<string>;
  };
  trash?: Trash;
  backups?: Backups;
  setupLibrary?(): Promise<Library | null>;
  rename?(id: string, input: {name: string; revision: string}): Promise<Document>;
  renameLibrary?(id: string, name: string): Promise<Library>;
  attachments?: {
    externalImageUrl?(url: string): string;
    upload(id: string, file: Blob): Promise<{path: string; type: string}>;
    read(id: string, path: string): Promise<Blob>;
  };
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

export interface TrashItem {
  id: string; generation: number; libraryId: string; libraryName: string;
  name: string; revision: string; size: number; deletedAt: number;
  state: 'moving' | 'retained' | 'restoring' | 'purging'; activeOperationId: string | null;
}
export interface TrashOperation {
  operationId: string; action: 'move' | 'restore' | 'purge'; state: 'pending' | 'confirmed' | 'failed';
  trashId: string; submittedAt: number; updatedAt: number;
  result: {id?: string; libraryId?: string; name?: string; revision?: string; size?: number; modifiedAt?: number | null} | null;
  error: {code: string; message: string} | null;
}
export interface Trash {
  version: 1;
  list(cursor?: string): Promise<{items: TrashItem[]; nextCursor: string | null; retention: 'until_permanently_deleted'}>;
  move(input: {documentId: string; revision: string; operationId: string}): Promise<TrashOperation>;
  status(operationId: string): Promise<TrashOperation>;
  retry(operationId: string): Promise<TrashOperation>;
  restore(id: string, input: {generation: number; operationId: string; name?: string}): Promise<TrashOperation>;
  purge(id: string, input: {generation: number; operationId: string; confirmed: true}): Promise<TrashOperation>;
}
