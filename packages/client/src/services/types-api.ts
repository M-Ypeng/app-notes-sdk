import type { NoteAnchor, NoteComment, NotesFile } from '../types.js';

export interface NotesListResponse {
  pagePath?: string;
  files: NotesFile[];
}

export interface AppendPayload {
  anchor: NoteAnchor;
  comment: Omit<NoteComment, 'id' | 'status' | 'createdAt'>;
}

export interface UpdateAnchorPayload {
  anchor: NoteAnchor;
}
