export type NoteTag = '疑问' | '变更建议' | '逻辑补充' | '视觉规范';
export type NoteRole = 'PM' | 'UI' | 'FE' | 'BE' | 'QA';
export type CommentStatus = 'open' | 'archived';
export type AnchorHealth = 'stable' | 'medium' | 'low' | 'invalid' | 'rebind_required';

export interface NoteAnchor {
  noteId: string;
  pagePath: string;
  xpath?: string;
  cssSelector?: string;
  selectors?: string[];
  selectorHint?: string;
  textHint?: string;
  tagName?: string;
  health?: AnchorHealth;
}

export interface NoteComment {
  id: string;
  content: string;
  images: string[];
  tags: NoteTag[];
  role: NoteRole;
  status: CommentStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface NotesFile {
  schemaVersion: 1;
  anchor: NoteAnchor;
  comments: NoteComment[];
  meta?: {
    createdAt: string;
    updatedAt: string;
  };
}

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
