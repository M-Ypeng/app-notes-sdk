export type { AnchorHealth, CommentStatus, NoteAnchor, NoteComment, NoteRole, NotesFile, NotesFixRecord, NotesRuntimeContext, NoteTag } from '../../client/dist/index.js';
import type { CommentStatus, NoteAnchor, NoteComment, NotesFixRecord, NotesRuntimeContext } from '../../client/dist/index.js';

export const APP_NOTES_SCHEMA_VERSION = 2 as const;

export interface AppendCommentBody {
  anchor: NoteAnchor;
  comment: Omit<NoteComment, 'id' | 'status' | 'createdAt'> & {
    id?: string;
    status?: CommentStatus;
    createdAt?: string;
  };
  context?: NotesRuntimeContext;
}

export interface ArchiveCommentBody {
  status: CommentStatus;
}

export interface UpdateAnchorBody {
  anchor: NoteAnchor;
}

export interface UpdateFixBody {
  fix: NotesFixRecord;
}
