import type { AppendPayload, NotesListResponse } from './types-api.js';
import type { CommentStatus, NoteAnchor, NoteComment } from '../types.js';

export interface NotesDataSource {
  health(): Promise<boolean>;
  fetchNotes(pagePath?: string): Promise<NotesListResponse>;
  appendComment(anchor: NoteAnchor, comment: Omit<NoteComment, 'id' | 'status' | 'createdAt'>): Promise<NoteComment>;
  archiveComment(noteId: string, commentId: string, status: CommentStatus): Promise<NoteComment>;
  uploadImage(file: File | Blob, filename?: string): Promise<string>;
}

export class NotesApiClient implements NotesDataSource {
  constructor(private baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}/api${path}`;
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(this.url('/health'));
      return res.ok;
    } catch {
      return false;
    }
  }

  async fetchNotes(pagePath?: string): Promise<NotesListResponse> {
    const query = pagePath ? `?pagePath=${encodeURIComponent(pagePath)}` : '';
    const res = await fetch(this.url(`/notes${query}`));
    if (!res.ok) throw new Error(`Failed to fetch notes: ${res.status}`);
    return res.json() as Promise<NotesListResponse>;
  }

  async appendComment(anchor: NoteAnchor, comment: Omit<NoteComment, 'id' | 'status' | 'createdAt'>): Promise<NoteComment> {
    const res = await fetch(this.url('/notes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anchor, comment } satisfies AppendPayload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    const data = (await res.json()) as { comment: NoteComment };
    return data.comment;
  }

  async archiveComment(noteId: string, commentId: string, status: CommentStatus): Promise<NoteComment> {
    const res = await fetch(this.url(`/notes/${encodeURIComponent(noteId)}/comments/${encodeURIComponent(commentId)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error(`Failed to update note status: ${res.status}`);
    const data = (await res.json()) as { comment: NoteComment };
    return data.comment;
  }

  async uploadImage(file: File | Blob, filename?: string): Promise<string> {
    const form = new FormData();
    const name = filename ?? (file instanceof File ? file.name : 'paste.png');
    form.append('file', file, name);
    const res = await fetch(this.url('/upload'), { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const data = (await res.json()) as { relativePath: string };
    return data.relativePath;
  }
}

export class MemoryNotesClient implements NotesDataSource {
  private files = new Map<string, import('../types.js').NotesFile>();
  private images = new Map<string, Blob>();

  async health(): Promise<boolean> {
    return true;
  }

  async fetchNotes(pagePath?: string): Promise<NotesListResponse> {
    const files = Array.from(this.files.values()).filter((file) => !pagePath || file.anchor.pagePath === pagePath);
    return { pagePath, files };
  }

  async appendComment(anchor: NoteAnchor, comment: Omit<NoteComment, 'id' | 'status' | 'createdAt'>): Promise<NoteComment> {
    const now = new Date().toISOString();
    const saved: NoteComment = {
      id: crypto.randomUUID(),
      content: comment.content,
      images: comment.images ?? [],
      tags: comment.tags ?? [],
      role: comment.role,
      status: 'open',
      createdAt: now
    };
    const existing = this.files.get(anchor.noteId);
    if (existing) {
      existing.comments.push(saved);
      existing.meta = { createdAt: existing.meta?.createdAt ?? now, updatedAt: now };
    } else {
      this.files.set(anchor.noteId, {
        schemaVersion: 1,
        anchor,
        comments: [saved],
        meta: { createdAt: now, updatedAt: now }
      });
    }
    return saved;
  }

  async archiveComment(noteId: string, commentId: string, status: CommentStatus): Promise<NoteComment> {
    const file = this.files.get(noteId);
    const comment = file?.comments.find((item) => item.id === commentId);
    if (!comment) throw new Error('NOT_FOUND');
    comment.status = status;
    comment.updatedAt = new Date().toISOString();
    return comment;
  }

  async uploadImage(file: File | Blob, filename?: string): Promise<string> {
    const name = `${crypto.randomUUID()}-${filename ?? (file instanceof File ? file.name : 'paste.png')}`;
    this.images.set(name, file);
    return `memory://${name}`;
  }
}
