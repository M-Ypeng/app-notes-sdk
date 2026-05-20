export type NoteTag = '疑问' | '变更建议' | '逻辑补充' | '视觉规范';
export type NoteRole = 'PM' | 'UI' | 'FE' | 'BE' | 'QA';
export type CommentStatus = 'open' | 'archived';
export type AnchorHealth = 'stable' | 'medium' | 'low' | 'invalid' | 'rebind_required';

export const NOTE_TAGS: NoteTag[] = ['疑问', '变更建议', '逻辑补充', '视觉规范'];
export const NOTE_ROLES: NoteRole[] = ['PM', 'UI', 'FE', 'BE', 'QA'];

export const TAG_LABELS: Record<NoteTag, string> = {
  疑问: '[疑问]',
  变更建议: '[变更建议]',
  逻辑补充: '[逻辑补充]',
  视觉规范: '[视觉规范]'
};

/** 创建备注时记录的视口相对位置，用于响应式 / 小屏下区分重复节点。 */
export interface AnchorLayoutHint {
  relCenterX: number;
  relCenterY: number;
  relWidth: number;
  relHeight: number;
}

export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

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
  layoutHint?: AnchorLayoutHint;
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

export interface FlatNote {
  noteId: string;
  anchor: NoteAnchor;
  comment: NoteComment;
}

export interface AppNotesConfig {
  serverUrl?: string;
  pagePath?: string;
  enabled?: boolean;
  mode?: 'memory' | 'server';
  onNavigateToPage?: (pagePath: string) => void | Promise<void>;
}
