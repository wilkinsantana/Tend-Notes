/** Public Tend document capability, version 1. No imports from the host source. */
export interface Library { id: string; name: string; canCreate: boolean }
export interface Note { id: string; libraryId: string; name: string; modifiedAt: number | null; size: number }
export interface Document extends Note { content: string; revision: string }
export interface Page { items: Note[]; total: number; nextOffset: number | null }
export interface Documents {
  version: 1;
  libraries(): Promise<Library[]>;
  index(libraryId: string, skipped?: number): Promise<{ indexed: number; skipped: number; more: boolean }>;
  list(libraryId: string, query?: string, offset?: number): Promise<Page>;
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
