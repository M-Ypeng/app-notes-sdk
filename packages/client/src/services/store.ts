import type { AnchorHealth, FlatNote, NotesFile } from '../types.js';
import { getAnchorHealth } from '../utils/dom-anchor.js';

type Listener = () => void;

export class NotesStore {
  private files: NotesFile[] = [];
  private bubblesVisible = true;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setFiles(files: NotesFile[]): void {
    this.files = files;
    this.emit();
  }

  getFiles(): NotesFile[] {
    return this.files;
  }

  getFlatNotes(includeArchived = true): FlatNote[] {
    const notes: FlatNote[] = [];
    for (const file of this.files) {
      for (const comment of file.comments) {
        if (!includeArchived && comment.status === 'archived') continue;
        notes.push({ noteId: file.anchor.noteId, anchor: file.anchor, comment });
      }
    }
    return notes.sort((a, b) => new Date(b.comment.createdAt).getTime() - new Date(a.comment.createdAt).getTime());
  }

  getOpenNotes(pagePath?: string): FlatNote[] {
    return this.getFlatNotes(false).filter((note) => !pagePath || note.anchor.pagePath === pagePath);
  }

  addFile(file: NotesFile): void {
    const index = this.files.findIndex((item) => item.anchor.noteId === file.anchor.noteId);
    if (index >= 0) this.files[index] = file;
    else this.files.push(file);
    this.emit();
  }

  updateCommentStatus(noteId: string, commentId: string, status: 'open' | 'archived'): void {
    const file = this.files.find((item) => item.anchor.noteId === noteId);
    const comment = file?.comments.find((item) => item.id === commentId);
    if (!comment) return;
    comment.status = status;
    comment.updatedAt = new Date().toISOString();
    this.emit();
  }

  getHealthSummary(): Record<AnchorHealth, number> {
    const summary: Record<AnchorHealth, number> = {
      stable: 0,
      medium: 0,
      low: 0,
      invalid: 0,
      rebind_required: 0
    };
    for (const file of this.files) summary[getAnchorHealth(file.anchor)]++;
    return summary;
  }

  setBubblesVisible(visible: boolean): void {
    this.bubblesVisible = visible;
    this.emit();
  }

  areBubblesVisible(): boolean {
    return this.bubblesVisible;
  }

  toggleBubbles(): void {
    this.setBubblesVisible(!this.bubblesVisible);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}
