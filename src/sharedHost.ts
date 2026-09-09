/** Narrow collaboration capability supplied by the Tend host to a shared note view. */
export interface SharedParticipant {
  id: string;
  name: string;
  anchor: number | null;
  head: number | null;
}

export interface SharedState {
  name: string;
  content: string;
  documentId: string;
  permission: 'view' | 'edit';
  allowAttachments: boolean;
  status: 'saved' | 'saving' | 'reconnecting' | 'blocked';
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  participants?: SharedParticipant[];
  selection?: {start:number;end:number};
}

export interface SharedHost {
  version: 1;
  subscribe(listener: (state: SharedState) => void): () => void;
  edit(before: string, after: string): void;
  undo(): void;
  redo(): void;
  beginComposition(): void;
  endComposition(): void;
  presence?(anchor: number, head: number): void;
  upload(file: Blob): Promise<{path: string; type: string}>;
  readAttachment(path: string): Promise<Blob>;
}
