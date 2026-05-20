export type { AnchorHealth, CommentStatus, NoteAnchor, NoteComment, NoteRole, NotesFile, NoteTag } from '../../client/dist/index.js';
import type { CommentStatus, NoteAnchor, NoteComment } from '../../client/dist/index.js';

export interface AppendCommentBody {
  anchor: NoteAnchor;
  comment: Omit<NoteComment, 'id' | 'status' | 'createdAt'> & {
    id?: string;
    status?: CommentStatus;
    createdAt?: string;
  };
}

export interface ArchiveCommentBody {
  status: CommentStatus;
}

export interface UpdateAnchorBody {
  anchor: NoteAnchor;
}
