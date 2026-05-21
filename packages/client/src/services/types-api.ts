import type { NoteAnchor, NoteComment, NotesFile, NotesFixRecord, NotesRuntimeContext } from '../types.js';

export interface NotesListResponse {
  pagePath?: string;
  files: NotesFile[];
}

export interface AppendPayload {
  anchor: NoteAnchor;
  comment: Omit<NoteComment, 'id' | 'status' | 'createdAt'>;
  context?: NotesRuntimeContext;
}

export interface UpdateAnchorPayload {
  anchor: NoteAnchor;
}

export interface UpdateFixPayload {
  fix: NotesFixRecord;
}
